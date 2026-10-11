/**
 * "מה השתנה" (הכרעת בעלים 9.10.2026, החלטה 8): לכל משפחת רשימות, נקודה אחת ל-2022 ונקודה אחת להיום על אותו ציר,
 * (בלי קו ביניהן). אין כאן חישוב חדש — האחוזים והטווח כבר מחושבים בצינור (`model.json`), וכאן רק גובה הציר והשינוי.
 */
import { binSegs, clipSegs, intSegs, type Seg } from "./chartLanguage";

/** יחידת המדידה בגרף: אחוז מהקולות, או מנדטים (מתג אחד למסך, הכרעת בעלים 11.10.2026) */
export type DumbbellUnit = "pct" | "seats";

export interface DumbbellRow {
  id: string;
  /** שמות הרשימות היום */
  name: string;
  /** שמות הרשימות ב-2022 */
  from: string;
  /** ב-2022, ביחידה של הגרף (אחוז מהקולות הכשרים או מנדטים) */
  before: number;
  /** היום לפי הממוצע, באותה יחידה */
  now: number;
  /** רשימה של 2022 שהתפצלה: ה-2022 שלה הוא הערכה, ומסומן "~" */
  approx?: boolean;
  /** התפלגות כל התרחישים: תאים של רבע אחוז (`ShareHist`) או כמה תרחישים בכל מספר שלם של מנדטים (מערך). ממנה עובי הנר בכל קטע (נחתך לטווח 80%); null — מחנה ששונה ידנית */
  hist: ShareHist | number[] | null;
  /** טווח 80% מהתרחישים (מ-10% עד 90%): הקצוות של הנר; null — מחנה ששונה ידנית */
  range: [number, number] | null;
}

/** התפלגות רציפה בתאים: `counts[i]` = כמה תרחישים באחוז שבין `start + i*step` ל-`start + (i+1)*step` */
export interface ShareHist {
  start: number;
  step: number;
  counts: number[];
}

/** קטעי הנר של משפחה: ההתפלגות בכל התרחישים, חתוכה לטווח 80% (כלל הטווחים: תרחישים ⇐ 80%). מחנה ששונה ידנית: אין נר */
export function dumbbellSegs(r: Pick<DumbbellRow, "hist" | "range">): Seg[] {
  if (!r.hist || !r.range) return [];
  const all = Array.isArray(r.hist) ? intSegs(r.hist) : binSegs(r.hist.start, r.hist.step, r.hist.counts);
  return clipSegs(all, r.range[0], r.range[1]);
}

/**
 * ציר לפי הטווח הדרוש (הכרעת בעלים 11.10.2026): מהערך הנמוך ועד הגבוה בכל השורות (2022, היום וקצות הנר), ועוד רווח משני הצדדים
 * (10% מהטווח, לפחות חצי יחידה). הקצוות מעוגלים לצעד עגול (1, 2, 5, 10, 20) כך שיש 3–6 סימונים, ואינם יורדים מתחת ל-0.
 */
export function dumbbellAxis(rows: DumbbellRow[], unit: DumbbellUnit = "pct"): { min: number; max: number; ticks: number[] } {
  const vals = rows.flatMap((r) => [r.before, r.now, ...(r.range ?? [])]);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 10;
  const pad = Math.max((hi - lo) * 0.1, unit === "pct" ? 0.5 : 1);
  const a = Math.max(0, lo - pad), b = hi + pad;
  const step = [1, 2, 5, 10, 20, 50].find((st) => (b - a) / st <= 5) ?? 50;
  const min = Math.floor(a / step) * step;
  const max = Math.max(min + step, Math.ceil(b / step) * step);
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
  return { min, max, ticks };
}

/** השינוי בנקודות אחוז, מעוגל לעשירית (כמו שמוצג), כך שהסימן והמספר תמיד מתאימים */
export const change = (r: Pick<DumbbellRow, "before" | "now">) => Math.round((r.now - r.before) * 10) / 10;

/** אחוז בספרה אחת אחרי הנקודה */
export const r1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("he-IL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** שינוי בנקודות אחוז עם סימן (מינוס אמיתי, U+2212); 0 — "0.0" */
export const diffText = (x: number) => {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? "0.0" : `${v > 0 ? "+" : "−"}${r1(Math.abs(v))}`;
};
