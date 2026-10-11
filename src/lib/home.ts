import { TOTAL } from "./fillAll";

/**
 * נתוני מסך הבית. הכול נגזר מ-`model.json` ומהסקרים האחרונים: אין כאן חישוב חדש.
 * 🔴 מספר אחד לכל עובדה (הכרעת בעלים 9.10.2026, החלטה 14 "ליישר"): מנדטי הממשלה היוצאת בכותרת, בלוח ובמגמה
 * הם סכום הממוצעים של הרשימות (`central`), אותו סכום שבדירוג. הטווח (`lo`–`hi`, `blocLo`–`blocHi`) הוא טווח 80% מהתרחישים.
 * 🔴 כלל הטווחים (הכרעת בעלים 9.10.2026): כל טווח שמבוסס על תרחישים הוא 80% (מ-10% עד 90%); כל טווח שמבוסס על סקרים, השערות, נתונים או חוק הבחירות הוא מלא (הנמוך והגבוה).
 */
export interface HomeModel {
  asof: string;
  start: string;
  polls: number;
  central: { seats: Record<string, number> };
  scenarios: {
    lists: Record<string, { seats: number[]; pass: number; seatsMean: number; seatsHist?: number[] }>;
    bloc: { seats: number[]; seatsHist?: number[] };
  };
  trend: { date: string; seats: Record<string, number> }[];
}

export interface HomeRow {
  id: string;
  name: string;
  /** מנדטים לפי ממוצע המודל */
  central: number;
  /** טווח 80% מהתרחישים */
  lo: number;
  hi: number;
  /** שיעור התרחישים שבהם הרשימה עוברת את אחוז החסימה (0 עד 1) */
  pass: number;
  /** התפלגות המנדטים בכל התרחישים: `hist[v]` = בכמה תרחישים הרשימה קיבלה v מנדטים. מזה נבנה עובי הנר בכל קטע (נחתך לטווח 80%) */
  hist: number[];
}

export interface HomeData {
  start: string;
  gov: number;
  other: number;
  /** טווח 80% של הגוש (מ-10% עד 90%) */
  blocLo: number;
  blocHi: number;
  /** התפלגות סכום הגוש בכל התרחישים (לעובי הנר, נחתך לטווח 80%) */
  blocHist: number[];
  /** מעל הקו: עוברות בבירור */
  safe: HomeRow[];
  /** על הסף: עוברות בחלק מהתרחישים בלבד, עם האחוז הקיים */
  edge: HomeRow[];
  /** מתחת לסף בכל התרחישים כמעט */
  below: HomeRow[];
  /** מנדטי הממשלה היוצאת לאורך זמן */
  series: { date: string; v: number }[];
}

/** אחוז התרחישים שמתחתיו הרשימה "מתחת לסף", ומעליו "עוברת בבירור" */
export const EDGE_MIN = 0.005;
export const EDGE_MAX = 0.995;

export function buildHome(
  model: HomeModel,
  opts: { govIds: string[]; nameOf: (id: string) => string; sure: (id: string) => boolean },
): HomeData {
  const { govIds, nameOf, sure } = opts;
  const rows: HomeRow[] = Object.keys(model.scenarios.lists)
    .map((id) => {
      const l = model.scenarios.lists[id];
      return { id, name: nameOf(id), central: model.central.seats[id] ?? 0, lo: l.seats[0], hi: l.seats[2], pass: l.pass, hist: l.seatsHist ?? [] };
    })
    .sort((a, b) => b.central - a.central || model.scenarios.lists[b.id].seatsMean - model.scenarios.lists[a.id].seatsMean);

  const isEdge = (r: HomeRow) => !sure(r.id) && r.pass > EDGE_MIN && r.pass < EDGE_MAX;
  const edge = rows.filter(isEdge);
  const below = rows.filter((r) => !isEdge(r) && r.pass <= EDGE_MIN);
  const safe = rows.filter((r) => !isEdge(r) && r.pass > EDGE_MIN);

  const govSum = (seats: Record<string, number>) => govIds.reduce((a, id) => a + (seats[id] ?? 0), 0);
  const gov = govSum(model.central.seats);
  const series = model.trend.map((t) => ({ date: t.date, v: govSum(t.seats) }));

  return {
    start: model.start,
    gov,
    other: TOTAL - gov,
    blocLo: model.scenarios.bloc.seats[0],
    blocHi: model.scenarios.bloc.seats[2],
    blocHist: model.scenarios.bloc.seatsHist ?? [],
    safe,
    edge,
    below,
    series,
  };
}

/** "9/9" מתוך 2026-09-09 */
export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
