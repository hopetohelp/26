/**
 * מקור אחד לנתוני כל מערכת בחירות (סשן ה, docs/תוכנית-נתונים-מלאים-לכל-המערכות-04-11-2026.md; כלל ברזל 9):
 * ממיר את `polls.json` (2026) ואת `history.json` (2015–2022, ו־2013 כשתתווסף) לאותו מבנה, כדי שמסך "סקרים"
 * יהיה רכיב אחד לכל המערכות והנתונים בלבד ישתנו. שדה שאין לו נתון — מערך ריק / null, והמסך מציג "נתון חסר · נשלים בהמשך".
 *
 * חוזה הנתונים בין הסשנים: `history.json` ⇐ `cycles[]` יכול לקבל `exitPolls` (מבנה `polls.json.exitPolls`, במפתחות של אותה מערכת),
 * `subgroupPolls`, `listSubmission` (תאריך), ו־`verificationStatus` בכל סקר — המסך מציג אותם ברגע שהם קיימים, בלי שינוי ממשק.
 */
import historyFile from "../data/history.json";
import { exitPolls as exitPolls2026, listName as listName2026, lists2026, activeLists2026, polls as polls2026, results, subgroupPolls as subgroups2026, pollsterKey, pollsterLabel, type ExitPoll, type Poll, type SubgroupPoll } from "./data";
import { finalPolls, hasResults, results2026, ELECTION_DAY } from "./guessAccuracyData";
import { SIMPLE_BLOCS, type BlocDef } from "./simpleSources";
import { quality } from "./quality";
import { blocAssignment } from "./electionBlocs";
import { MODEL_AVERAGE, SOURCE_OPTIONS } from "./dataResolver";
import { K26_ID, previousElection } from "./election";
import { hasFlowFile } from "./flowFiles";
import { eveSnapshot, historyBlocs, type Cycle, type ElectionResult, type HistPoll } from "./history";

export interface ElectionResultSeats {
  /** מנדטים לכל רשימה, במפתחות של אותה מערכת */
  seats: Record<string, number>;
}

/** הנתונים שמסך "סקרים" צריך, זהים במבנה לכל מערכת */
export interface ElectionData {
  id: string;
  /** יום הבחירות */
  day: string;
  /** שם המערכת הקודמת, לכותרת "מבחירות …"; null כשאינה באתר */
  prevLabel: string | null;
  /** כל הסקרים (באותו מבנה של polls.json) */
  polls: Poll[];
  /** הסקרים לחישוב הממוצעים והמגמות (פורסמו ועקביים, לפני יום הבחירות) */
  usable: Poll[];
  exitPolls: ExitPoll[];
  subgroupPolls: SubgroupPoll[];
  /** הסקר האחרון של כל מכון ומזמין ב־14 הימים שלפני הבחירות */
  finalIds: Set<string>;
  /** היום האחרון להגשת הרשימות; null — טרם הוזן למערכת הזו */
  listSubmission: string | null;
  /** הרשימות שהממוצע בטבלת "מהגשת הרשימות" מחושב עליהן; undefined — כולן */
  activeIds?: string[];
  /** תוצאות אמת; null — אין עדיין */
  result: ElectionResultSeats | null;
  /** הגושים בטבלאות ובמגמות */
  blocs: readonly BlocDef[];
  listName: (key: string) => string;
  /** כל הרשימות, לסדר הצבעים בגרפים */
  listOrder: string[];
  /** תקופות במגמות */
  periods: { id: string; label: string; from: string }[];
  /** היום האחרון במגמות */
  trendTo: string;
  /** סדרות מכון ומזמין לבחירה במגמות */
  seriesOptions: { id: string; label: string }[];
  /** מקור הטבלאות, לשורת המקור */
  sourceNote: string;
}

const cycles = (historyFile as unknown as { cycles: (Cycle & { exitPolls?: ExitPoll[]; subgroupPolls?: SubgroupPoll[]; listSubmission?: string })[] }).cycles;
const pastResults = results as unknown as ElectionResult[];

/** מצבי הבדיקה של הסקרים הישנים (raw/forecast/verification) ⇐ מצבי הבדיקה של האתר (verificationLabel) */
const STATUS: Record<string, NonNullable<Poll["verification"]>["status"]> = {
  match: "match", corrected: "corrected", partial: "partial", unavailable: "unreachable", inconsistent: "mismatch",
  out_of_window: "out_of_window", not_a_poll: "not_a_poll",
};

/** סקר מ־history.json ⇐ אותו מבנה של polls.json */
export function fromHistory(c: Cycle, p: HistPoll & { verificationStatus?: string }): Poll {
  const status = p.verificationStatus ? STATUS[p.verificationStatus] ?? "secondary" : null;
  return {
    id: p.id, start: p.start, end: p.end,
    firm: p.firmKey, firmHe: p.firmHe, publisher: p.publisherHe, publisherHe: p.publisherHe,
    sample: null, values: p.values, gov: null,
    consistent: p.consistent, eligibleToShow: p.consistent,
    urls: p.urls,
    verified: status === "match" || status === "corrected",
    ...(status ? { verification: { status, checkedAt: "", source: null, details: {} } } : {}),
    // tableLine 0 = שורת הסקר בטבלת המקור לא נשמרה (נשמרה רק שורת הטבלה)
    source: { page: c.source.page, tableLine: 0 },
  };
}

const cache = new Map<string, ElectionData>();

function build2026(): ElectionData {
  const to = MODEL_AVERAGE.asOf < ELECTION_DAY ? MODEL_AVERAGE.asOf : ELECTION_DAY;
  return {
    id: K26_ID, day: ELECTION_DAY, prevLabel: previousElection(K26_ID)?.label ?? null,
    polls: polls2026, usable: polls2026.filter((p) => p.eligibleToShow),
    exitPolls: exitPolls2026, subgroupPolls: subgroups2026,
    finalIds: new Set(finalPolls.map((p) => p.id)),
    listSubmission: quality.coverage.listSubmission,
    activeIds: activeLists2026.map((l) => l.id),
    result: hasResults() ? { seats: results2026.seats } : null,
    blocs: SIMPLE_BLOCS,
    listName: listName2026,
    listOrder: lists2026.map((l) => l.id),
    // תקופות (הכרעת בעלים 03.11.2026): הגשת הרשימות — quality.listSubmission; פיזור הכנסת — 17.7.2026 (ויקיפדיה, טבלת הסקרים)
    periods: [
      { id: "lists", label: "מהגשת הרשימות", from: quality.coverage.listSubmission },
      { id: "dissolution", label: "מפיזור הכנסת", from: "2026-07-17" },
      { id: "k25", label: "מבחירות 22", from: "2022-11-01" },
    ],
    trendTo: to,
    seriesOptions: SOURCE_OPTIONS.filter((o) => o.seriesId).map((o) => ({ id: o.id, label: o.label })),
    sourceNote: "טבלאות הסקרים בוויקיפדיה האנגלית (עם קישור למקור של כל סקר)",
  };
}

function buildPast(id: string): ElectionData | null {
  const c = cycles.find((x) => x.id === id);
  const r = pastResults.find((x) => x.id === id);
  if (!c || !r) return null;
  const polls = c.polls.map((p) => fromHistory(c, p)).sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
  const usable = polls.filter((p) => p.consistent && p.end < c.date);
  const first = usable.reduce((a, p) => (p.end < a ? p.end : a), usable[0]?.end ?? c.date);
  const names = new Map(r.lists.map((l) => [l.letters, l.short]));
  // ארבעת הגושים של האתר כשיש שיוך (blocAssignment, מקור אחד); אחרת — הגושים ההיסטוריים (ממליצות על נתניהו · ערביות · יתר), עד שיוך מלא
  const blocs: readonly BlocDef[] = blocAssignment(id)
    ?? historyBlocs(c, r).map((b) => ({ id: b.id, name: b.name, short: b.short, lists: b.letters }));
  const pollsterSeries = [...new Map(usable.map((p) => [pollsterKey(p), pollsterLabel(p)])).entries()].sort((a, b) => a[1].localeCompare(b[1], "he"));
  return {
    id, day: c.date, prevLabel: previousElection(id)?.label ?? null,
    polls, usable,
    exitPolls: c.exitPolls ?? [], subgroupPolls: c.subgroupPolls ?? [],
    finalIds: new Set(eveSnapshot(c).map((p) => p.id)),
    listSubmission: c.listSubmission ?? null,
    result: { seats: Object.fromEntries(r.lists.map((l) => [l.letters, l.seats])) },
    blocs,
    listName: (k) => names.get(k) ?? k,
    listOrder: [...r.lists].sort((a, b) => b.votes - a.votes).map((l) => l.letters),
    periods: [{ id: "all", label: "כל המערכה", from: first }],
    trendTo: c.date,
    seriesOptions: pollsterSeries.map(([k, label]) => ({ id: `series:${k}`, label })),
    sourceNote: `טבלאות הסקרים בוויקיפדיה האנגלית, "${c.source.page}" (עם קישור למקור של כל סקר)`,
  };
}

/** נתוני המערכת; מערכת לא מוכרת ⇐ 2026 */
export function electionData(id: string): ElectionData {
  const hit = cache.get(id);
  if (hit) return hit;
  const d = id === K26_ID ? build2026() : buildPast(id) ?? electionData(K26_ID);
  cache.set(id, d);
  return d;
}

/** מעבר מצביעים מוכן להצגה למערכת: 2026 (flow2026.json) וכל מערכת שיש לה src/data/flows/kNN.json (src/lib/flowFiles.ts) */
export const hasVoterFlow = hasFlowFile;

/**
 * שיוך רשימות בין מערכות (raw/lineage.json): קיים רק ל־2022 ⇐ 2026. משמש את "מה השתנה" הישן (Changes.tsx) —
 * רלוונטי במהלך מערכה שבה השיוך לרשימות המתמודדות אינו ודאי (הכרעת בעלים 04.11.2026); מוצג לפי מתג "lineage" במסך הניהול.
 */
export const hasLineage = (id: string) => id === K26_ID;

/** סכום הגוש בתוצאת האמת */
export const resultBloc = (d: ElectionData, lists: readonly string[]) => d.result ? lists.reduce((t, x) => t + (d.result!.seats[x] ?? 0), 0) : null;
