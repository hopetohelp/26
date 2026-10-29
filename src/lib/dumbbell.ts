/**
 * "מה השתנה" (הכרעת בעלים 9.10.2026, החלטה 8): לכל משפחת רשימות, נקודה אחת ל-2022 ונקודה אחת להיום על אותו ציר,
 * (בלי קו ביניהן), ונר של טווח הסקרים סביב "היום" (הכרעת בעלים 12.10.2026, הכרעה 6: מהסקר הנמוך עד הגבוה, הסקר האחרון של כל סדרה
 * ב-14 הימים האחרונים). כאן רק הנר, גובה הציר והשינוי; האחוזים של 2022 והיום מחושבים בצינור, וההמרה של מנדטים לאחוזים — לפי החוק (`pctForListSeats`).
 */
import { valueSegs, type Seg } from "./chartLanguage";

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
  /** קטעי הנר, ביחידה של הגרף: עובי כל קטע לפי כמה סקרים נותנים את הערך (`pollSegs`); ריק — אין נר */
  segs: Seg[];
  /** טווח הסקרים (הנמוך והגבוה, טווח מלא): הקצוות של הנר; null — אין סקרים לרשימה */
  range: [number, number] | null;
}

/**
 * הנר של טווח הסקרים (כלל הטווחים: סקרים ⇐ טווח מלא): `seats` = המנדטים של הרשימה בכל סקר (`pollSeatValues`), והעובי לפי כמה סקרים נותנים כל ערך.
 * באחוזים (`toPct`, מנדטים שלמים ⇐ אחוז לפי החוק): כל קצה של קטע מומר, ובין שני מספרים שלמים של מנדטים — באינטרפולציה. אין שום המרה ⇐ אין נר.
 * `range` (לא חובה): הנר נמתח עד הקצוות האלה, כשהטווח באחוזים הורחב כך שיכלול את הממוצע (כמו ב"הכנסת שלי").
 */
export function pollSegs(seats: number[], toPct?: (seats: number) => number | null, range?: [number, number] | null): Seg[] {
  const segs = valueSegs(seats);
  if (!toPct || !segs.length) return segs;
  // מספר מנדטים שאין לו אחוז (1 עד 3: מתחת לסף אי אפשר לקבל אותם) — אינטרפולציה בין הערכים הקרובים שיש להם
  const lo = Math.max(0, Math.floor(segs[0].from)), hi = Math.ceil(segs[segs.length - 1].to);
  const known: [number, number][] = [];
  for (let k = lo; k <= hi; k++) { const v = toPct(k); if (v !== null) known.push([k, v]); }
  const at = (x: number): number | null => {
    if (!known.length) return null;
    const below = [...known].reverse().find(([k]) => k <= x + 1e-9) ?? known[0];
    const above = known.find(([k]) => k >= x - 1e-9) ?? known[known.length - 1];
    if (above[0] === below[0]) return below[1];
    return below[1] + ((above[1] - below[1]) * (x - below[0])) / (above[0] - below[0]);
  };
  const out: Seg[] = [];
  for (const g of segs) {
    const from = at(g.from), to = at(g.to);
    if (from === null || to === null) return [];
    out.push({ from, to, count: g.count });
  }
  if (range) {
    out[0] = { ...out[0], from: Math.min(out[0].from, range[0]) };
    out[out.length - 1] = { ...out[out.length - 1], to: Math.max(out[out.length - 1].to, range[1]) };
  }
  return out;
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

/** השינוי ב%, מעוגל לעשירית (כמו שמוצג), כך שהסימן והמספר תמיד מתאימים */
export const change = (r: Pick<DumbbellRow, "before" | "now">) => Math.round((r.now - r.before) * 10) / 10;

/** אחוז בספרה אחת אחרי הנקודה */
export const r1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("he-IL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** שינוי ב% עם סימן (מינוס אמיתי, U+2212); 0 — "0.0" */
export const diffText = (x: number) => {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? "0.0" : `${v > 0 ? "+" : "−"}${r1(Math.abs(v))}`;
};
