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
  /** לוח המושבים: גוש הקואליציה (גוש נתניהו), המפלגות הערביות, והשאר (גוש אייזנקוט); הסכום 120 */
  blocs: { coalition: number; arab: number; opposition: number };
  /** טווח 80% של הגוש (מ-10% עד 90%) */
  blocLo: number;
  blocHi: number;
  /** התפלגות סכום הגוש בכל התרחישים (לעובי הנר, נחתך לטווח 80%) */
  blocHist: number[];
  /**
   * 🔴 סיכון אחוז החסימה (הכרעת בעלים 12.10.2026, הכרעה 4): לפי הסקרים האחרונים בלבד — הסקר האחרון של כל סדרה (מכון+גוף תקשורת)
   * ב-14 הימים האחרונים, אותה הגדרה של הממוצע הפשוט. לא נגזר מהממוצע ולא מהתרחישים. חל בכל האתר חוץ ממסך התרחישים.
   * מעל הקו: כל הסקרים האחרונים, כולל הפסימי ביותר עבורה, מעבירים אותה את אחוז החסימה — אינה בסיכון.
   */
  safe: HomeRow[];
  /** בסיכון (על קו החסימה): לפחות סקר אחד מהאחרונים אינו מעביר אותה, ולפחות אחד כן. `pass` (שיעור התרחישים) מוצג לצידה עם סימון מודל */
  edge: HomeRow[];
  /** מתחת לסף: אף סקר מהאחרונים אינו מעביר אותה (או שלא נשאלה באף אחד מהם) */
  below: HomeRow[];
  /** הסיכון שעולה מתרחישי המודל בלבד (רק למסך התרחישים): עוברות בחלק מהתרחישים — יותר מ-`EDGE_MIN` ופחות מ-`EDGE_MAX` */
  scenarioEdge: HomeRow[];
  /** מנדטי הממשלה היוצאת לאורך זמן */
  series: { date: string; v: number }[];
}

/** הסיכון מתרחישי המודל בלבד (מסך התרחישים): עוברת ביותר מ-0.5% מהתרחישים ובפחות מ-99.5% */
export const EDGE_MIN = 0.005;
export const EDGE_MAX = 0.995;

export function buildHome(
  model: HomeModel,
  opts: {
    govIds: string[];
    nameOf: (id: string) => string;
    /** כל הסקרים האחרונים מעבירים אותה (`passesInAll`) */
    sure: (id: string) => boolean;
    /** אף סקר מהאחרונים אינו מעביר אותה (`passesInNone`) */
    out: (id: string) => boolean;
    coalitionIds?: string[];
    arabIds?: string[];
  },
): HomeData {
  const { govIds, nameOf, sure, out } = opts;
  const rows: HomeRow[] = Object.keys(model.scenarios.lists)
    .map((id) => {
      const l = model.scenarios.lists[id];
      return { id, name: nameOf(id), central: model.central.seats[id] ?? 0, lo: l.seats[0], hi: l.seats[2], pass: l.pass, hist: l.seatsHist ?? [] };
    })
    .sort((a, b) => b.central - a.central || model.scenarios.lists[b.id].seatsMean - model.scenarios.lists[a.id].seatsMean);

  // לפי הסקרים האחרונים בלבד (הכרעה 4): עוברת בכולם ⇐ מעל הקו; באף אחד ⇐ מתחת לסף; אחרת ⇐ בסיכון
  const safe = rows.filter((r) => sure(r.id));
  const below = rows.filter((r) => !sure(r.id) && out(r.id));
  const edge = rows.filter((r) => !sure(r.id) && !out(r.id));
  const scenarioEdge = rows.filter((r) => r.pass > EDGE_MIN && r.pass < EDGE_MAX);

  const govSum = (seats: Record<string, number>) => govIds.reduce((a, id) => a + (seats[id] ?? 0), 0);
  const gov = govSum(model.central.seats);
  const sumOf = (ids: string[]) => ids.reduce((a, id) => a + (model.central.seats[id] ?? 0), 0);
  const coalition = opts.coalitionIds ? sumOf(opts.coalitionIds) : gov;
  const arab = opts.arabIds ? sumOf(opts.arabIds) : 0;
  const series = model.trend.map((t) => ({ date: t.date, v: govSum(t.seats) }));

  return {
    start: model.start,
    gov,
    other: TOTAL - gov,
    blocs: { coalition, arab, opposition: TOTAL - coalition - arab },
    blocLo: model.scenarios.bloc.seats[0],
    blocHi: model.scenarios.bloc.seats[2],
    blocHist: model.scenarios.bloc.seatsHist ?? [],
    safe,
    edge,
    below,
    scenarioEdge,
    series,
  };
}

/** "9/9" מתוך 2026-09-09 */
export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
