/**
 * דיוק הסקרים בעבר: הסקרים של חמש המערכות 2019א–2022 מול התוצאות הרשמיות.
 * כל החישובים טהורים (מקבלים את הנתונים כפרמטר) — כדי שאפשר יהיה לבדוק אותם, ושקובץ הסקרים הישנים
 * ייטען רק בעמוד שמשתמש בו.
 */

export interface HistValue {
  /** מנדטים */
  s?: number;
  /** אחוז (רשימה מתחת לסף) */
  p?: number;
  /** גבול עליון כשהסקר פרסם טווח אחוזים */
  pMax?: number;
}

export interface HistPoll {
  id: string;
  start: string;
  end: string;
  firmKey: string;
  firmHe: string;
  publisherHe: string | null;
  values: Record<string, HistValue>;
  seatSum: number;
  consistent: boolean;
  urls: string[];
}

export interface Cycle {
  id: string;
  knesset: number;
  date: string;
  label: string;
  /** הרשימות שהמליצו על נתניהו לנשיא המדינה אחרי הבחירות */
  recommendedNetanyahu: string[];
  polls: HistPoll[];
  source: { page: string; sha256: string; tableLine: number };
}

export interface ResultList {
  letters: string;
  short: string;
  name: string;
  seats: number;
  votes: number;
}

export interface ElectionResult {
  id: string;
  knesset: number;
  date: string;
  label: string;
  valid: number;
  lists: ResultList[];
}

const DAY = 86_400_000;
export const toTime = (d: string) => Date.parse(d + "T12:00:00Z");

/** חלון "ערב הבחירות" — אותו חלון כמו בעמוד "המצב היום" */
export const EVE_DAYS = 14;

/** ממוצע חשבוני (הכרעת בעלים 9.10.2026: תמיד ממוצע, לא חציון) */
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** מנדטים בסקר: מתחת לסף = 0; לא נשאלה = undefined */
export function seatsOf(p: HistPoll, letters: string): number | undefined {
  const v = p.values[letters];
  if (!v) return undefined;
  if (typeof v.s === "number") return v.s;
  if (typeof v.p === "number") return 0;
  return undefined;
}

/** סקרים שאפשר לנתח: סכום המנדטים קרוב ל-120, והעבודה בשטח הסתיימה לפני יום הבחירות */
export function usable(c: Cycle): HistPoll[] {
  return c.polls.filter((p) => p.consistent && p.end < c.date);
}

const pollsterOf = (p: HistPoll) => `${p.firmKey}|${p.publisherHe ?? ""}`;

/**
 * מה השיטה של עמוד "המצב היום" הייתה רואה ערב הבחירות: הסקר האחרון של כל מכון+מזמין
 * ב-14 הימים שלפני יום הבחירות.
 */
export function eveSnapshot(c: Cycle, days = EVE_DAYS): HistPoll[] {
  const end = toTime(c.date) - DAY;
  const map = new Map<string, HistPoll>();
  for (const p of usable(c)) {
    const t = toTime(p.end);
    if (t > end || t <= end - days * DAY) continue;
    const cur = map.get(pollsterOf(p));
    if (!cur || p.end > cur.end) map.set(pollsterOf(p), p);
  }
  return [...map.values()].sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.id < b.id ? -1 : 1));
}

/** הרשימות שמשווים: כל רשימה שנכנסה לכנסת, וכל רשימה שהופיעה בסקרים של המערכה */
export function comparedLists(c: Cycle, r: ElectionResult): ResultList[] {
  const polled = new Set(usable(c).flatMap((p) => Object.keys(p.values)));
  return r.lists.filter((l) => l.seats > 0 || polled.has(l.letters));
}

export interface ListComparison {
  letters: string;
  name: string;
  /** ממוצע בין המכונים; NaN אם אף מכון לא שאל עליה */
  estimate: number;
  min: number;
  max: number;
  /** בכמה סקרים הרשימה עברה את הסף */
  above: number;
  n: number;
  actual: number;
  /** סקרים פחות תוצאה: חיובי = הסקרים נתנו יותר */
  diff: number;
  /** רוב הסקרים טעו בשאלה אם הרשימה עוברת את אחוז החסימה (רוב הסקרים נתנו לה מנדטים, והיא לא עברה, או להפך) */
  thresholdMiss: boolean;
}

export function compareLists(c: Cycle, r: ElectionResult, polls: HistPoll[]): ListComparison[] {
  return comparedLists(c, r)
    .map((l) => {
      const xs = polls.map((p) => seatsOf(p, l.letters)).filter((x): x is number => typeof x === "number");
      const estimate = xs.length ? mean(xs) : NaN;
      const est0 = Number.isNaN(estimate) ? 0 : estimate;
      const above = xs.filter((x) => x > 0).length;
      const pollsSayPass = xs.length > 0 && above >= Math.ceil(xs.length / 2);
      return {
        letters: l.letters,
        name: l.short,
        estimate,
        min: xs.length ? Math.min(...xs) : NaN,
        max: xs.length ? Math.max(...xs) : NaN,
        above,
        n: xs.length,
        actual: l.seats,
        diff: est0 - l.seats,
        thresholdMiss: pollsSayPass !== l.seats > 0,
      };
    })
    .sort((a, b) => b.actual - a.actual || (b.estimate || 0) - (a.estimate || 0));
}

/** סך הפער: סכום ההפרשים המוחלטים בין הסקרים לתוצאה, על פני כל הרשימות */
export const totalGap = (rows: { diff: number }[]) => rows.reduce((a, r) => a + Math.abs(r.diff), 0);

export function blocOf(rows: ListComparison[], letters: string[]) {
  const sel = rows.filter((r) => letters.includes(r.letters));
  return {
    estimate: sel.reduce((a, r) => a + (Number.isNaN(r.estimate) ? 0 : r.estimate), 0),
    actual: sel.reduce((a, r) => a + r.actual, 0),
  };
}

export interface CycleSummary {
  cycle: Cycle;
  result: ElectionResult;
  snapshot: HistPoll[];
  rows: ListComparison[];
  gap: number;
  bloc: { estimate: number; actual: number };
  misses: ListComparison[];
}

export function summarizeCycle(c: Cycle, r: ElectionResult): CycleSummary {
  const snapshot = eveSnapshot(c);
  const rows = compareLists(c, r, snapshot);
  return { cycle: c, result: r, snapshot, rows, gap: totalGap(rows), bloc: blocOf(rows, c.recommendedNetanyahu), misses: rows.filter((x) => x.thresholdMiss) };
}

/** הפער של סקר בודד מול התוצאה. רשימה שהסקר לא שאל עליה נספרת כאפס. */
export function pollGap(c: Cycle, r: ElectionResult, p: HistPoll) {
  const lists = comparedLists(c, r);
  const gap = lists.reduce((a, l) => a + Math.abs((seatsOf(p, l.letters) ?? 0) - l.seats), 0);
  const bloc = c.recommendedNetanyahu.reduce((a, x) => a + (seatsOf(p, x) ?? 0), 0);
  return { gap, bloc };
}

export interface PollsterEntry {
  cycleId: string;
  label: string;
  date: string;
  publishers: string[];
  gap: number;
  bloc: number;
  blocActual: number;
}

/**
 * מכוני הסקרים לאורך המערכות. לכל מכון ובכל מערכת — הסקרים שלו מהיום האחרון שבו פרסם ב-14 הימים שלפני
 * הבחירות. אם באותו יום פרסם לכמה גופים, נלקח הממוצע של הסקרים (כל גוף נספר פעם אחת).
 */
export function pollsterRecords(cycles: Cycle[], results: ElectionResult[]) {
  const out = new Map<string, { firmKey: string; firmHe: string; entries: PollsterEntry[] }>();
  for (const c of cycles) {
    const r = results.find((x) => x.id === c.id)!;
    const lists = comparedLists(c, r);
    const byFirm = new Map<string, HistPoll[]>();
    for (const p of eveSnapshot(c)) byFirm.set(p.firmKey, [...(byFirm.get(p.firmKey) ?? []), p]);
    for (const [firmKey, ps] of byFirm) {
      const last = ps.reduce((a, p) => (p.end > a ? p.end : a), "");
      const final = ps.filter((p) => p.end === last);
      const avg = (letters: string) => final.reduce((a, p) => a + (seatsOf(p, letters) ?? 0), 0) / final.length;
      const gap = lists.reduce((a, l) => a + Math.abs(avg(l.letters) - l.seats), 0);
      const bloc = c.recommendedNetanyahu.reduce((a, x) => a + avg(x), 0);
      const blocActual = c.recommendedNetanyahu.reduce((a, x) => a + (r.lists.find((l) => l.letters === x)?.seats ?? 0), 0);
      const rec = out.get(firmKey) ?? { firmKey, firmHe: final[0].firmHe, entries: [] };
      rec.entries.push({
        cycleId: c.id,
        label: c.label,
        date: last,
        publishers: final.map((p) => p.publisherHe ?? "ללא גוף מזמין"),
        gap,
        bloc,
        blocActual,
      });
      out.set(firmKey, rec);
    }
  }
  return [...out.values()]
    .map((x) => ({ ...x, meanGap: x.entries.reduce((a, e) => a + e.gap, 0) / x.entries.length }))
    .sort((a, b) => b.entries.length - a.entries.length || a.meanGap - b.meanGap);
}

/**
 * רשימות ומשפחות שחוזרות בכל המערכות. אותיות לפי מערכת — כי שמות ושותפויות השתנו.
 * "המפלגות הערביות" = כל הרשימות שהתמודדו בכל מערכת, ביחד (פעם ברשימה משותפת אחת, פעם בכמה).
 */
export const FAMILIES: { id: string; name: string; byKnesset: Record<number, string[]> }[] = [
  { id: "likud", name: "הליכוד", byKnesset: { 21: ["מחל"], 22: ["מחל"], 23: ["מחל"], 24: ["מחל"], 25: ["מחל"] } },
  { id: "shas", name: 'ש"ס', byKnesset: { 21: ["שס"], 22: ["שס"], 23: ["שס"], 24: ["שס"], 25: ["שס"] } },
  { id: "utj", name: "יהדות התורה", byKnesset: { 21: ["ג"], 22: ["ג"], 23: ["ג"], 24: ["ג"], 25: ["ג"] } },
  { id: "yb", name: "ישראל ביתנו", byKnesset: { 21: ["ל"], 22: ["ל"], 23: ["ל"], 24: ["ל"], 25: ["ל"] } },
  {
    id: "arab",
    name: "המפלגות הערביות (יחד)",
    byKnesset: { 21: ["ום", "דעם"], 22: ["ודעם"], 23: ["ודעם"], 24: ["ודעם", "עם"], 25: ["ום", "עם", "ד"] },
  },
];

export interface FamilyRow {
  id: string;
  name: string;
  cells: { cycleId: string; estimate: number; actual: number; diff: number }[];
  /** בכמה מערכות הסקרים נתנו פחות מהתוצאה / יותר ממנה */
  under: number;
  over: number;
  meanDiff: number;
}

export function familyRows(summaries: CycleSummary[]): FamilyRow[] {
  const rows: FamilyRow[] = FAMILIES.map((f) => {
    const cells = summaries.map((s) => {
      const letters = f.byKnesset[s.cycle.knesset] ?? [];
      const sel = s.rows.filter((r) => letters.includes(r.letters));
      const estimate = sel.reduce((a, r) => a + (Number.isNaN(r.estimate) ? 0 : r.estimate), 0);
      const actual = sel.reduce((a, r) => a + r.actual, 0);
      return { cycleId: s.cycle.id, estimate, actual, diff: estimate - actual };
    });
    return {
      id: f.id,
      name: f.name,
      cells,
      under: cells.filter((x) => x.diff < 0).length,
      over: cells.filter((x) => x.diff > 0).length,
      meanDiff: cells.reduce((a, x) => a + x.diff, 0) / cells.length,
    };
  });
  const bloc = summaries.map((s) => ({ cycleId: s.cycle.id, ...s.bloc, diff: s.bloc.estimate - s.bloc.actual }));
  rows.push({
    id: "bloc",
    name: "הרשימות שהמליצו על נתניהו",
    cells: bloc,
    under: bloc.filter((x) => x.diff < 0).length,
    over: bloc.filter((x) => x.diff > 0).length,
    meanDiff: bloc.reduce((a, x) => a + x.diff, 0) / bloc.length,
  });
  return rows;
}

/** ממוצע מתגלגל לאורך המערכה: בכל יום — ממוצע הסקרים מ-`days` הימים שקדמו לו (לפחות `minN` סקרים) */
export function campaignTrend(c: Cycle, letters: string, days = 7, minN = 3) {
  const ps = usable(c);
  if (!ps.length) return [];
  const first = ps.reduce((a, p) => (p.end < a ? p.end : a), ps[0].end);
  const last = ps.reduce((a, p) => (p.end > a ? p.end : a), ps[0].end);
  const out: { t: number; v: number; n: number }[] = [];
  for (let t = toTime(first); t <= toTime(last); t += DAY) {
    const xs = ps
      .filter((p) => toTime(p.end) <= t && toTime(p.end) > t - days * DAY)
      .map((p) => seatsOf(p, letters))
      .filter((x): x is number => typeof x === "number");
    if (xs.length >= minN) out.push({ t, v: mean(xs), n: xs.length });
  }
  return out;
}
