/**
 * הצירים של גרף המגמה האחיד (`CandleTrend`, הכרעת בעלים 11.10.2026): קווים מקווקווים כל 5 מנדטים,
 * ובגרפים של גושים במקום קו 60 — קו 61 (הרוב). נר כל 3 ימים; כשאין מקום — דוללים נרות, תמיד כולל האחרון.
 */
export interface AxisLine {
  v: number;
  /** קו הרוב (61): בשחור ובעבה; כל השאר באפור */
  major: boolean;
}

export interface TrendAxis {
  lo: number;
  hi: number;
  lines: AxisLine[];
}

/** קו הרוב (61) מוצג רק כשהגוש עבר את 55 (הכרעת בעלים 11.10.2026) */
export const MAJORITY_SHOWN_ABOVE = 55;

/**
 * התחום וקווי העזר. התחום מעוגל כלפי מטה וכלפי מעלה לכפולות של `step` (5), כך שכל הערכים בפנים.
 * `majority` (61, בגרפים של גושים): מוצג רק אם הערך הגבוה בגרף מעל 55 (`MAJORITY_SHOWN_ABOVE`), והקו שהכי קרוב אליו (60) מוחלף בו.
 * מעל 14 קווים הצעד גדל ל-10, ל-20 וכן הלאה, כדי שהציר לא יתמלא.
 */
export function trendAxis(values: number[], opts: { step?: number; majority?: number } = {}): TrendAxis {
  const vs = values.filter((v) => Number.isFinite(v));
  let step = opts.step ?? 5;
  let min = vs.length ? Math.min(...vs) : 0;
  let max = vs.length ? Math.max(...vs) : step;
  const m = opts.majority;
  const useMajority = m !== undefined && max > MAJORITY_SHOWN_ABOVE;
  if (useMajority) max = Math.max(max, m!);
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi === lo) hi = lo + step;
  while ((hi - lo) / step > 14) { step *= 2; lo = Math.floor(min / step) * step; hi = Math.ceil(max / step) * step; }
  const lines: AxisLine[] = [];
  for (let v = lo; v <= hi; v += step) lines.push({ v, major: false });
  if (useMajority) {
    const at = lines.reduce((best, l, i) => (Math.abs(l.v - m!) < Math.abs(lines[best].v - m!) ? i : best), 0);
    lines[at] = { v: m!, major: true };
  }
  return { lo, hi, lines };
}

/**
 * קו מקווקו מוצג רק אם יש נתונים בין הקו לקו הסמוך לו: ברצועה שמתחתיו או ברצועה שמעליו (הכרעת בעלים 11.10.2026).
 * נתון = נר (`[lo, hi]`) או נקודה בקו (`[v, v]`); רצועה שנתון נוגע בה נחשבת מאוכלסת. בלי נתונים — כל הקווים.
 */
export function visibleLines(lines: AxisLine[], spans: [number, number][]): AxisLine[] {
  if (!spans.length || lines.length < 2) return lines;
  const populated = lines.slice(0, -1).map((l, i) => spans.some(([a, b]) => a <= lines[i + 1].v && b >= l.v));
  return lines.filter((_, i) => (i > 0 && populated[i - 1]) || (i < lines.length - 1 && populated[i]));
}

/**
 * דילול נרות: נר כל 3 ימים, אבל כשהמרחק ביניהם קטן מ-`minGap` פיקסלים (טווח ארוך בגרף צר) משאירים נקודות במרחק מספיק זו מזו,
 * מהסוף אחורה, כך שהנר האחרון (היום) תמיד נשאר.
 */
export function thinCandles<T extends { t: number }>(points: T[], plotPx: number, minGap = 20): T[] {
  if (points.length < 2 || plotPx <= 0) return points;
  const span = points[points.length - 1].t - points[0].t;
  if (span <= 0) return points;
  const px = (a: number, b: number) => ((b - a) / span) * plotPx;
  const out: T[] = [points[points.length - 1]];
  for (let i = points.length - 2; i >= 0; i--) {
    if (px(points[i].t, out[0].t) >= minGap) out.unshift(points[i]);
  }
  return out;
}

/** תוויות ציר הזמן: הראשונה והאחרונה תמיד, ובאמצע עד `max` תוויות במרווחים שווים (לפי מספר הנרות) */
export function labelIndexes(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>([0, n - 1]);
  for (let k = 1; k < max - 1; k++) out.add(Math.round((k * (n - 1)) / (max - 1)));
  return [...out].sort((a, b) => a - b);
}
