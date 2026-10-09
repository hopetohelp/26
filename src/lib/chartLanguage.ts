/**
 * שפת הציור האחידה של כל הגרפים (הכרעת בעלים 9.10.2026). ארבעה סימנים, וכל אחד משמעותו אחת בכל האתר:
 * - **טווח** = נר: פס מהנמוך אל הגבוה, **שעוביו משתנה לאורכו** לפי כמות הנתונים בכל קטע: עבה היכן שרוב הנתונים, דק בקצוות.
 *   העובי בחמש רמות ביחס לקטע העמוס ביותר באותו נר: מתחת ל-20% רמה 1, מ-20% רמה 2, מ-40% רמה 3, מ-60% רמה 4, מ-80% רמה 5.
 *   דוגמה (הבעלים): 30 משתתפים על הליכוד, 20 בין 28 ל-30, 8 בין 26 ל-32, 2 בין 24 ל-34 ⇐ באמצע 5, מהצדדים 3, ובקצוות 1.
 *   אפשר גם ביחס לכל הגרף (`levelSegs(…, "chart")`, כמו נרות ווליום), אבל אז נר פזור נראה דק כולו.
 *   הנר נבנה מקטעים (`Seg`): מהתפלגות של מספרים שלמים (`intSegs`), מרשימת ערכים (`valueSegs`), מתאים רציפים (`binSegs`) או מרבעונים (`quantileSegs`).
 * - **ממוצע נוכחי** = עיגול בינוני מלא (עובי 4).
 * - צבע לכל סימן (הכרעת בעלים 9.10.2026): טווח כחול, סמן על קו שחור, ממוצע אדום, תוצאה כתומה, מעוין ירוק. טוקנים `--mk-*` ב-`src/index.css`; בלי קו לבן מסביב לסימנים.
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
export const CANDLE_PX: readonly number[] = [3, 6, 10, 14, 18];

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
  candleW: [3, 5, 8, 11, 14] as readonly number[],
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

/** קטע בנר: מ-`from` עד `to` (ביחידות הציר), ו-`count` = כמות הנתונים בו (או צפיפות, בנר שנבנה מרבעונים) */
export interface Seg {
  from: number;
  to: number;
  count: number;
}
/** קטע עם רמת העובי שלו (1 עד 5) */
export interface LSeg {
  from: number;
  to: number;
  level: Level;
}

/** חותך קטעים לטווח [lo, hi] (קטעים שמחוץ לטווח נזרקים) */
export function clipSegs(segs: Seg[], lo: number, hi: number): Seg[] {
  return segs
    .map((g) => ({ from: Math.max(g.from, lo), to: Math.min(g.to, hi), count: g.count }))
    .filter((g) => g.to > g.from + 1e-9);
}

/**
 * התפלגות של מספרים שלמים: `counts[i]` = כמה נתונים בערך `offset + i`. כל ערך הוא קטע ברוחב 1 שמרכזו בערך,
 * והנר נחתך בדיוק ל-[min, max] של הנתונים (קטעי הקצה בחצי רוחב), כך שהוא מתחיל ונגמר במספרים שכתובים לידו.
 * חורים (ערכים בלי נתונים בין הקצוות) נשארים בספירה 0, ומצוירים בעובי הדק ביותר כדי שהנר יישאר רציף.
 */
export function intSegs(counts: number[], offset = 0): Seg[] {
  let first = counts.findIndex((c) => c > 0);
  if (first < 0) return [];
  let last = counts.length - 1;
  while (last > first && counts[last] === 0) last--;
  const out: Seg[] = [];
  for (let i = first; i <= last; i++) {
    const v = offset + i;
    out.push({ from: i === first ? v : v - 0.5, to: i === last ? v : v + 0.5, count: counts[i] });
  }
  // ערך יחיד: קטע ברוחב אפס. נותנים לו רוחב סמלי כדי שיתאר נר
  if (out.length === 1) out[0] = { from: out[0].from - 0.25, to: out[0].to + 0.25, count: out[0].count };
  return out;
}

/** רשימת ערכים שלמים (למשל מנדטי כל מכון) ⇐ קטעים לפי כמה פעמים כל ערך מופיע */
export function valueSegs(values: number[]): Seg[] {
  const xs = values.filter((v) => Number.isFinite(v)).map(Math.round);
  if (!xs.length) return [];
  const lo = Math.min(...xs);
  const counts = new Array(Math.max(...xs) - lo + 1).fill(0);
  for (const v of xs) counts[v - lo]++;
  return intSegs(counts, lo);
}

/** התפלגות רציפה בתאים ברוחב `step` שמתחילים ב-`start` (למשל אחוזי קולות בתאים של רבע אחוז) */
export function binSegs(start: number, step: number, counts: number[]): Seg[] {
  const first = counts.findIndex((c) => c > 0);
  if (first < 0) return [];
  let last = counts.length - 1;
  while (last > first && counts[last] === 0) last--;
  return counts.slice(first, last + 1).map((c, k) => ({ from: start + (first + k) * step, to: start + (first + k + 1) * step, count: c }));
}

/**
 * נר מרבעונים (כשאין לנו את כל הנתונים אלא רק את הסיכום): [נמוך, רבעון תחתון, חציון, רבעון עליון, גבוה].
 * בכל קטע בין שתי נקודות עוברים 25% מהנתונים, ולכן הצפיפות (כמות לכל יחידת ציר) גבוהה היכן שהקטע צר ונמוכה בזנבות.
 * `minWidth` מונע צפיפות אינסופית כשרבעונים חופפים.
 */
export function quantileSegs(q: [number, number, number, number, number], minWidth = 0.5): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < 4; i++) {
    const from = q[i];
    const to = q[i + 1];
    if (to < from) continue;
    out.push({ from, to: Math.max(to, from + 1e-9), count: 0.25 / Math.max(to - from, minWidth) });
  }
  // קטעים באורך אפס (רבעונים שווים) מתמזגים לשכן, כדי שלא ייעלמו
  const merged: Seg[] = [];
  for (const g of out) {
    if (g.to - g.from < 1e-6 && merged.length) merged[merged.length - 1].count += g.count;
    else merged.push(g);
  }
  return merged;
}

/**
 * רמת העובי של קטע לפי חלקו מהקטע העמוס ביותר: 1 מתחת ל-20%, 2 מ-20%, 3 מ-40%, 4 מ-60%, 5 מ-80% ומעלה.
 * (בדוגמה של הבעלים, 20 משתתפים באמצע, 8 מסביב ו-2 בקצוות: 100% ⇐ 5, 40% ⇐ 3, 10% ⇐ 1.)
 */
export function segLevel(share: number): Level {
  if (!(share > 0)) return 1;
  return Math.min(5, Math.max(1, Math.floor(Math.min(1, share) * 5 + 1e-9) + 1)) as Level;
}

/**
 * נותן רמת עובי לכל קטע. `scope`:
 * - "candle" (ברירת המחדל, לפי הדוגמה של הבעלים): ביחס לקטע העמוס ביותר באותו נר, כך שכל נר מראה את הצורה שלו: עבה היכן שרוב הנתונים, דק בקצוות.
 * - "chart": ביחס לקטע העמוס ביותר בכל הגרף (כל הנרות יחד), כמו נרות ווליום: נר רחב ופזור נראה דק כולו.
 */
export function levelSegs(all: Seg[][], scope: "candle" | "chart" = "candle"): LSeg[][] {
  const chartMax = maxVolume(all.flatMap((segs) => segs.map((g) => g.count)));
  return all.map((segs) => {
    const max = scope === "chart" ? chartMax : maxVolume(segs.map((g) => g.count));
    return segs.map((g) => ({ from: g.from, to: g.to, level: segLevel(max > 0 ? g.count / max : 0) }));
  });
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
