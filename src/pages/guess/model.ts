/** נתוני היסוד של "ההשערה שלך": הרשימות, ממוצע הסקרים, תוצאות 2022 והמיפוי המובהק ביניהן. */
import modelFile from "../../data/model.json";
import type { Bloc, BlocsPayload, SeatCell, SeatsPayload, VotePayload } from "../../lib/crowdApi";
import { latestPerPollster, lists2026, results, seatsIn } from "../../lib/data";

const model = modelFile as unknown as { asof: string; central: { seats: Record<string, number>; shares: Record<string, number> } };

export const IDS = lists2026.map((l) => l.id);
export const ALPHA = [...lists2026].sort((a, b) => a.name.localeCompare(b.name, "he"));
export const POLLS: Record<string, number> = model.central.seats;
export const POLLS_AS_OF = model.asof;
const recentPolls = latestPerPollster(POLLS_AS_OF, 14);
export const POLL_RANGES: Record<string, [number, number]> = Object.fromEntries(IDS.map((id) => {
  const xs = recentPolls.map((p) => seatsIn(p, id)).filter((x): x is number => typeof x === "number");
  return [id, xs.length ? [Math.min(...xs), Math.max(...xs)] : [POLLS[id] ?? 0, POLLS[id] ?? 0]];
}));
/** ממוצע הסקרים באחוזים מהקולות הכשרים — בסיס "השלם הכול" בניחוש לפי אחוזים */
export const POLL_SHARES: Record<string, number> = model.central.shares;
export const nameOf = (id: string) => lists2026.find((l) => l.id === id)?.name ?? id;

const k25 = results.find((r) => r.id === "k25")!;
export const K25_LISTS = k25.lists as { letters: string; short: string; name: string; seats: number }[];
export const K25_PASSED = K25_LISTS.filter((l) => l.seats > 0);
export const K25_IDS = K25_LISTS.map((l) => l.letters);
export const k25Name = (letters: string) => K25_LISTS.find((l) => l.letters === letters)?.short ?? letters;

/** רק התאמות מובהקות — אותה רשימה בשם ובהרכב. כל השאר נשאר ריק, וזה מוסבר בממשק. */
export const K25_MAP: Record<string, string> = { likud: "מחל", shas: "שס", utj: "ג", yb: "ל", raam: "עם" };

/** התאמה לצורך השוואת בחירת הגולש בלבד; אינה משנה את תוצאות האמת או את פתיחת המנדטים. */
export const VOTE_MAP: Record<string, string> = { ...K25_MAP, rzp: "ט" };
export const k25VoteName = (letters: string) => letters === "ט" ? "הציונות הדתית/זהות" : k25Name(letters);

export const LOCK_AT = Date.parse("2026-10-26T23:59:00+02:00");
export { THRESHOLD_SEATS } from "../../lib/crowdValidate";

export function startSeats(start: SeatsPayload["start"]): SeatsPayload {
  const seats: Record<string, SeatCell> = {};
  for (const id of IDS) {
    if (start === "zero") seats[id] = { v: 0, src: "manual", locked: false };
    else if (start === "polls") seats[id] = { v: POLLS[id] ?? 0, src: "filled", locked: false };
    else {
      const l = K25_MAP[id] ? K25_LISTS.find((x) => x.letters === K25_MAP[id]) : undefined;
      seats[id] = l ? { v: l.seats, src: "manual", locked: true } : { v: 0, src: "manual", locked: false };
    }
  }
  return { seats, start, pollsAsOf: start === "polls" ? POLLS_AS_OF : null };
}

export const GOV_IDS = lists2026.filter((l) => l.gov37).map((l) => l.id);
/** חלוקת פתיחה למשתתף חדש לפי הכרעת הבעלים; אינה משנה גושים שמורים. */
export function defaultBlocs(): Bloc[] {
  // הכרעת בעלים 9.10.2026: הציבור החרדי בגוש הקואליציה; "כל השאר" ⇐ גוש האופוזיציה, שני בסדר
  const coalition = IDS.filter(id => GOV_IDS.includes(id) || ["amcha", "noam", "code_black", "haredi_public"].includes(id));
  const arab: string[] = IDS.filter(id => id === "joint" || id === "raam");
  return [
    { id: "gov", name: "גוש הקואליציה", lists: coalition, target: null },
    { id: "rest", name: "גוש האופוזיציה", lists: IDS.filter(id => !coalition.includes(id) && !arab.includes(id)), target: null },
    { id: "arab", name: "ערבים", lists: arab, target: null },
  ];
}
/** הרכב הממשלה הישן היה מרומז; משמרים אותו ואת יעדיו כתסריטים עצמאיים. */
export function normalizeBlocs(p: BlocsPayload): BlocsPayload {
  if (p.mode === "custom") return upgradeLegacyCoalition(p);
  return { mode: "custom", blocs: p.blocs.map(b => ({ ...b,
    name: b.name || (b.id === "gov" ? "מפלגות הממשלה היוצאת" : "יתר המפלגות"),
    lists: b.id === "gov" ? [...GOV_IDS] : b.id === "rest" ? IDS.filter(id => !GOV_IDS.includes(id)) : b.lists,
  })) };
}
export const DEFAULT_BLOCS: BlocsPayload = { mode: "custom", blocs: defaultBlocs() };
export const EMPTY_VOTE: VotePayload = { v2022: null, v2026: null };

export const V2022_LABEL: Record<string, string> = {
  other: "רשימה אחרת",
  none: "לא הצבעתי",
  blank: "פתק לבן או פסול",
  ineligible: "לא הייתה לי זכות הצבעה",
  private: "מעדיף/ה לא לומר",
};
export const V2026_LABEL: Record<string, string> = { undecided: "עוד לא החלטתי", none: "לא אצביע", ineligible: "לא הייתה לי זכות הצבעה", private: "מעדיף/ה לא לומר" };

/** גוש הקואליציה שנשמר לפני שנעם וצבע שחור נוספו לברירת המחדל — אותו גוש (הכרעת בעלים 8.10.2026). כמו `canonicalLists` בשרת. */
const LEGACY_COALITION = ["amcha", "likud", "otzma", "rzp", "shas", "utj"].join(",");
function upgradeLegacyCoalition(p: BlocsPayload): BlocsPayload {
  return upgradeHarediPublic(upgradeNoam(p));
}
function upgradeNoam(p: BlocsPayload): BlocsPayload {
  const legacy = (b: Bloc) => [...new Set(b.lists)].sort().join(",") === LEGACY_COALITION;
  if (!p.blocs.some(legacy)) return p;
  const added = ["noam", "code_black"].filter(id => IDS.includes(id));
  return { ...p, blocs: p.blocs.map(b => legacy(b) ? { ...b, lists: [...b.lists, ...added] } : { ...b, lists: b.lists.filter(id => !added.includes(id)) }) };
}
/** גושי ברירת המחדל שנשמרו לפני 9.10.2026: הציבור החרדי עובר מ"כל השאר" לגוש הקואליציה, ו"כל השאר" נקרא גוש האופוזיציה. כמו `canonicalLists` בשרת. */
const key = (lists: string[]) => [...new Set(lists)].sort().join(",");
function upgradeHarediPublic(p: BlocsPayload): BlocsPayload {
  const fresh = defaultBlocs();
  const newCo = fresh.find(b => b.id === "gov")!.lists, newOpp = fresh.find(b => b.id === "rest")!.lists;
  const oldCo = key(newCo.filter(id => id !== "haredi_public")), oldOpp = key([...newOpp, "haredi_public"]);
  if (!p.blocs.some(b => key(b.lists) === oldCo || key(b.lists) === oldOpp)) return p;
  const blocs = p.blocs.map(b => key(b.lists) === oldCo ? { ...b, lists: [...b.lists, "haredi_public"] }
    : key(b.lists) === oldOpp ? { ...b, lists: b.lists.filter(id => id !== "haredi_public"), name: b.name === "כל השאר" ? "גוש האופוזיציה" : b.name } : b);
  // סדר ברירת המחדל: קואליציה, אופוזיציה, ערבים
  const order = ["gov", "rest", "arab"];
  return { ...p, blocs: [...blocs].sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 9) - (order.includes(b.id) ? order.indexOf(b.id) : 9)) };
}
