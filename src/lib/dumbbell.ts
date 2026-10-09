/**
 * "מה השתנה" (הכרעת בעלים 9.10.2026, החלטה 8): לכל משפחת רשימות, נקודה אחת ל-2022 ונקודה אחת להיום על אותו ציר,
 * (בלי קו ביניהן). אין כאן חישוב חדש — האחוזים והטווח כבר מחושבים בצינור (`model.json`), וכאן רק גובה הציר והשינוי.
 */
export interface DumbbellRow {
  id: string;
  /** שמות הרשימות היום */
  name: string;
  /** שמות הרשימות ב-2022 */
  from: string;
  /** אחוז מהקולות הכשרים ב-2022 */
  before: number;
  /** אחוז היום לפי הממוצע */
  now: number;
  /** התפלגות האחוז בכל התרחישים (תאים של רבע אחוז): ממנה הטווח המלא ועובי הנר בכל קטע; null — מחנה ששונה ידנית */
  hist: ShareHist | null;
}

/** התפלגות רציפה בתאים: `counts[i]` = כמה תרחישים באחוז שבין `start + i*step` ל-`start + (i+1)*step` */
export interface ShareHist {
  start: number;
  step: number;
  counts: number[];
}

/** הטווח המלא של התפלגות: הנמוך והגבוה מכל התרחישים (קצה התא הראשון והאחרון שיש בהם תרחישים) */
export function histBounds(h: ShareHist): [number, number] {
  const first = h.counts.findIndex((c) => c > 0);
  if (first < 0) return [h.start, h.start];
  let last = h.counts.length - 1;
  while (last > first && h.counts[last] === 0) last--;
  return [h.start + first * h.step, h.start + (last + 1) * h.step];
}

/** ציר 0 עד גבול עגול: צעד 5 עד 20, ואחרי זה צעד 10 (עד ארבעה-חמישה סימונים, שייכנסו בטלפון) */
export function dumbbellAxis(rows: DumbbellRow[]): { max: number; ticks: number[] } {
  const raw = Math.max(20, ...rows.flatMap((r) => [r.before, r.now, r.hist ? histBounds(r.hist)[1] : 0]));
  const step = raw <= 20 ? 5 : 10;
  const max = Math.ceil(raw / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
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
