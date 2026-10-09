/**
 * שפת הציור האחידה של כל הגרפים (הכרעת בעלים 9.10.2026). ארבעה סימנים, וכל אחד משמעותו אחת בכל האתר:
 * - **טווח** = נר: פס עבה מהנמוך אל הגבוה. העובי בחמש רמות לפי כמות הנתונים מאחורי הטווח, **ביחס לכל הגרף** (כמו נרות ווליום).
 * - **ממוצע נוכחי** = עיגול בינוני מלא (עובי 4).
 * - **תוצאת אמת** = עיגול גדול ריק (עובי 6).
 * - **סמן על קו** = עיגול קטן ריק (עובי 2). גרף מגמה הוא תמיד קו, עם סמנים כאלה.
 * ממוצע הגולשים בסקר האתר הוא מעוין ריק, כי זה לא סקר. הגדלים כאן הם מקור אחד ל-SVG ול-HTML (`src/index.css`, מחלקות `mk-*`).
 */
export type Level = 1 | 2 | 3 | 4 | 5;

/**
 * רמת עובי הנר: כמה נתונים עומדים מאחורי הטווח מול המקסימום באותו גרף, בחמישונים.
 * 1 = עד 20% מהמקסימום, 2 = 20 עד 40, 3 = 40 עד 60, 4 = 60 עד 80, 5 = 80 עד 100.
 * גרף שבו לכל הנרות אותה כמות נתונים: כולם ברמה 5.
 */
export function volumeLevel(n: number, max: number): Level {
  if (!(max > 0) || !(n > 0)) return 1;
  const share = Math.min(1, n / max);
  return Math.min(5, Math.max(1, Math.ceil(share * 5 - 1e-9))) as Level;
}

/** המקסימום באותו גרף, להשוואת עובי הנרות (מתעלם מערכים חסרים) */
export const maxVolume = (ns: (number | undefined)[]): number => Math.max(0, ...ns.filter((n): n is number => typeof n === "number" && Number.isFinite(n)));

/** עובי הנר בפיקסלים לפי הרמה, בשורות HTML (`.mk-c1` עד `.mk-c5` ב-`src/index.css`) */
export const CANDLE_PX: readonly number[] = [4, 7, 10, 13, 16];

/** מידות הסימנים בגרפי SVG (יחידות ה-viewBox): הסמן הקטן, הממוצע והתוצאה */
export const SVG_MARKS = {
  /** עיגול קטן ריק, עובי 2 */
  smallR: 3.5,
  smallStroke: 2,
  /** ממוצע: עיגול בינוני מלא, עובי 4 */
  meanR: 5.5,
  /** תוצאה: עיגול גדול ריק, עובי 6 */
  ringR: 10,
  ringStroke: 6,
  /** רוחב הנר בגרף SVG לפי רמה */
  candleW: [3, 5, 7, 9, 11] as readonly number[],
} as const;

interface Pt {
  x: number;
  y: number;
}

/**
 * קו עם פינות עגולות (לא ישרות): עקומה מונוטונית בכל קטע (כמו d3 `curveMonotoneX`), שאינה חורגת מעל או מתחת לנקודות.
 * מחזירה את תכונת `d` של path. פחות משתי נקודות: ריק.
 */
export function smoothPath(points: Pt[]): string {
  const n = points.length;
  if (n === 0) return "";
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  if (n === 1) return `M${f(points[0].x)},${f(points[0].y)}`;
  if (n === 2) return `M${f(points[0].x)},${f(points[0].y)}L${f(points[1].x)},${f(points[1].y)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push(dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i]);
  }
  const tan: number[] = new Array(n);
  tan[0] = slope[0];
  tan[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tan[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (2 * slope[i - 1] * slope[i]) / (slope[i - 1] + slope[i]);
  }
  // קצוות: מונעים חריגה
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = tan[i] / slope[i];
    const b = tan[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      tan[i] = t * a * slope[i];
      tan[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const w = dx[i] / 3;
    d += `C${f(points[i].x + w)},${f(points[i].y + tan[i] * w)},${f(points[i + 1].x - w)},${f(points[i + 1].y - tan[i + 1] * w)},${f(points[i + 1].x)},${f(points[i + 1].y)}`;
  }
  return d;
}

/** סמנים על הקו: לפחות `gap` יחידות בין סמן לסמן, והנקודה האחרונה תמיד כלולה */
export function sparseIndices(xs: number[], gap: number): number[] {
  const out: number[] = [];
  let last = -Infinity;
  xs.forEach((x, i) => {
    if (x - last >= gap) {
      out.push(i);
      last = x;
    }
  });
  if (xs.length && out[out.length - 1] !== xs.length - 1) {
    // הנקודה האחרונה מחליפה את הסמן הקודם אם הוא קרוב מדי אליה
    if (out.length && xs[xs.length - 1] - xs[out[out.length - 1]] < gap) out.pop();
    out.push(xs.length - 1);
  }
  return out;
}
