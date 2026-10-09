/**
 * שפת הציור האחידה של כל הגרפים (הכרעת בעלים 9.10.2026). ארבעה סימנים, וכל אחד משמעותו אחת בכל האתר:
 * - **טווח** = נר: פס מהנמוך אל הגבוה, **שעוביו משתנה לאורכו** לפי כמות הנתונים בכל קטע: עבה היכן שרוב הנתונים, דק בקצוות.
 *   העובי בשלוש רמות ביחס לקטע העמוס ביותר באותו נר: מתחת לשליש רמה 1 (דק, 4 פיקסלים), משליש רמה 3 (בינוני, 10), מ-⅔ רמה 5 (עבה, 16). (הכרעת בעלים 9.10.2026; היה 3, 10, 18.)
 *   (הרמות הן 1, 3 ו-5 כדי לשמור את שמות הרמות מההכרעה; רמות 2 ו-4 בוטלו, 9.10.2026.)
 *   המעבר בין הרמות **מעוגל**: קו המתאר של הנר עובר בעקומה חלקה דרך עובי כל קטע (`profilePath`), לא בצעדים מרובעים.
 *   דוגמה (הבעלים): 30 משתתפים על הליכוד, 20 בין 28 ל-30, 8 בין 26 ל-32, 2 בין 24 ל-34 ⇐ באמצע 5, מהצדדים 3, ובקצוות 1.
 *   אפשר גם ביחס לכל הגרף (`levelSegs(…, "chart")`, כמו נרות ווליום), אבל אז נר פזור נראה דק כולו.
 *   הנר נבנה מקטעים (`Seg`): מהתפלגות של מספרים שלמים (`intSegs`), מרשימת ערכים (`valueSegs`), מתאים רציפים (`binSegs`) או מרבעונים (`quantileSegs`).
 * - **ממוצע** = עיגול מלא אדום בקוטר 22, **גדול מהנר העבה** (`MARK_PX`; הכרעת בעלים 9.10.2026).
 * - **תוצאה (מציאות)** = עיגול ריק כתום בקוטר חיצוני 22, גדול מהנר העבה. גם ממוצע הגולשים בסקר האתר (שאינו סקר) מצויר כך.
 * - **סמן על קו** = עיגול קטן ריק (עובי 2). גרף מגמה הוא תמיד קו, עם סמנים כאלה.
 * - צבע לכל סימן (הכרעת בעלים 9.10.2026): טווח כחול, סמן על קו שחור, ממוצע אדום, תוצאה כתומה. טוקנים `--mk-*` ב-`src/index.css`; בלי קו לבן מסביב לסימנים.
 *   הגדלים כאן הם מקור אחד ל-SVG ול-HTML (`src/index.css`, מחלקות `mk-*`).
 */
export type Level = 1 | 3 | 5;

/** עובי הנר בפיקסלים לפי הרמה: דק, בינוני, עבה */
export const CANDLE_PX: Readonly<Record<Level, number>> = { 1: 4, 3: 10, 5: 16 };

/** קוטר עיגול הממוצע והתוצאה: גדול מהנר העבה (הכרעת בעלים 9.10.2026) */
export const MARK_PX = 22;

/** המקסימום באותו גרף, להשוואת עובי הנרות (מתעלם מערכים חסרים) */
export const maxVolume = (ns: (number | undefined)[]): number => Math.max(0, ...ns.filter((n): n is number => typeof n === "number" && Number.isFinite(n)));

/** מידות הסימנים בגרפי SVG (יחידות ה-viewBox): הסמן הקטן, הממוצע והתוצאה */
export const SVG_MARKS = {
  /** עיגול קטן ריק, עובי 2 */
  smallR: 3.5,
  smallStroke: 2,
  /** ממוצע: עיגול מלא, גדול מהנר העבה */
  meanR: MARK_PX / 2,
  /** תוצאה: עיגול ריק, קוטר חיצוני 22 (רדיוס הקו 8.5 וקו בעובי 5) */
  ringR: (MARK_PX - 5) / 2,
  ringStroke: 5,
} as const;

interface Pt {
  x: number;
  y: number;
}

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * מקטעי בזייה מונוטוניים (כמו d3 `curveMonotoneX`) דרך נקודות ש-x שלהן עולה: אינם חורגים מעל או מתחת לנקודות.
 * לכל קטע: שתי נקודות בקרה ונקודת הסיום. פחות משתי נקודות: ריק.
 */
function monotoneCubics(points: Pt[]): { c1: Pt; c2: Pt; p: Pt }[] {
  const n = points.length;
  if (n < 2) return [];
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
  return Array.from({ length: n - 1 }, (_, i) => {
    const w = dx[i] / 3;
    return {
      c1: { x: points[i].x + w, y: points[i].y + tan[i] * w },
      c2: { x: points[i + 1].x - w, y: points[i + 1].y - tan[i + 1] * w },
      p: points[i + 1],
    };
  });
}

/**
 * קו עם פינות עגולות (לא ישרות): עקומה מונוטונית בכל קטע, שאינה חורגת מעל או מתחת לנקודות.
 * מחזירה את תכונת `d` של path. פחות משתי נקודות: ריק.
 */
export function smoothPath(points: Pt[]): string {
  const n = points.length;
  if (n === 0) return "";
  const m = (p: Pt) => `${f2(p.x)},${f2(p.y)}`;
  if (n === 1) return `M${m(points[0])}`;
  if (n === 2) return `M${m(points[0])}L${m(points[1])}`;
  return monotoneCubics(points).reduce((d, c) => `${d}C${m(c.c1)},${m(c.c2)},${m(c.p)}`, `M${m(points[0])}`);
}

/** נקודה בקו המתאר של נר: מיקום לאורך הנר (`t`) ומחצית העובי שם (`h`) */
export interface ProfilePt {
  t: number;
  h: number;
}

/** פונקציית ההתפלגות המצטברת של ההתפלגות הנורמלית (קירוב של אברמוביץ וסטגון), לריכוך המעבר בין הרמות */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const p = 0.3989423 * Math.exp((-z * z) / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** כמה מרוכך המעבר בין הרמות, ביחס לרוחב הקטע החציוני: גדול יותר = עגול יותר */
export const PROFILE_SOFTNESS = 0.6;

/**
 * קו המתאר של נר שעוביו משתנה: עובי כל קטע לפי הרמה שלו (4, 10 או 16 פיקסלים), **מרוכך** לעקומה חלקה, כך שהמעבר בין הרמות עגול ולא מרובע.
 * הריכוך הוא טשטוש גאוסי של פונקציית המדרגות (כמו בגרף כינור), ואחריו מותחים את העובי כך שהקטע העמוס ביותר (תמיד רמה 5 בנר, כי העובי ביחס לנר) יחזור לעובי המלא,
 * והקצוות מתחדדים לעובי הדק (4). `map` ממפה ערך על הציר למיקום לאורך הנר, בכל כיוון (גם יורד, בנר אנכי). `scale` מקטין את כל העוביים יחד (בנרות צפופים).
 */
export function profilePoints(segs: LSeg[], map: (v: number) => number, scale = 1): ProfilePt[] {
  if (!segs.length) return [];
  const ext = segs.map((g) => {
    const a = map(g.from);
    const b = map(g.to);
    return { a: Math.min(a, b), b: Math.max(a, b), h: CANDLE_PX[g.level] / 2 };
  });
  const t0 = Math.min(...ext.map((e) => e.a));
  const t1 = Math.max(...ext.map((e) => e.b));
  const widths = ext.map((e) => e.b - e.a).sort((x, y) => x - y);
  const med = Math.max(widths[Math.floor(widths.length / 2)], 1e-6);
  const sigma = med * PROFILE_SOFTNESS;
  const lo = CANDLE_PX[1] / 2;
  const hmax = Math.max(...ext.map((e) => e.h));
  const span = Math.max(t1 - t0, 1e-6);
  const n = Math.min(80, Math.max(16, Math.ceil(span / (med / 2))));
  const taper = med * 0.5;
  const raw: ProfilePt[] = [];
  for (let k = 0; k <= n; k++) {
    const t = t0 + (span * k) / n;
    let num = 0;
    let den = 0;
    for (const e of ext) {
      const mass = normalCdf((e.b - t) / sigma) - normalCdf((e.a - t) / sigma);
      num += mass * e.h;
      den += mass;
    }
    let h = den > 1e-12 ? num / den : lo;
    // הקצוות מתחדדים לעובי הדק
    const d = Math.min(t - t0, t1 - t) / taper;
    if (d < 1) h = lo + (h - lo) * (d * d * (3 - 2 * d));
    raw.push({ t, h });
  }
  const smax = Math.max(...raw.map((p) => p.h));
  const stretch = smax > lo + 1e-9 ? (hmax - lo) / (smax - lo) : 1;
  return raw.map((p) => ({ t: p.t, h: (lo + (p.h - lo) * stretch) * scale }));
}

/**
 * צורת הנר כשטח סגור: הקו העליון והתחתון הם אותה עקומה חלקה (מונוטונית בין הקטעים, כך שהמעבר בין העוביים מעוגל ולא מרובע),
 * מצדי ציר שעובר ב-`mid`. `across`: "y" = נר אופקי (`t` הוא x), "x" = נר אנכי (`t` הוא y). מחזירה את תכונת `d` של path.
 */
export function profilePath(pts: ProfilePt[], mid: number, across: "x" | "y" = "y"): string {
  if (pts.length === 0) return "";
  const at = (t: number, s: number) => (across === "y" ? `${f2(t)},${f2(s)}` : `${f2(s)},${f2(t)}`);
  const upper = pts.map((p) => ({ x: p.t, y: mid - p.h }));
  const lower = pts.map((p) => ({ x: p.t, y: mid + p.h }));
  let d = `M${at(upper[0].x, upper[0].y)}`;
  for (const c of monotoneCubics(upper)) d += `C${at(c.c1.x, c.c1.y)} ${at(c.c2.x, c.c2.y)} ${at(c.p.x, c.p.y)}`;
  d += `L${at(lower[lower.length - 1].x, lower[lower.length - 1].y)}`;
  const back = monotoneCubics(lower);
  for (let i = back.length - 1; i >= 0; i--) d += `C${at(back[i].c2.x, back[i].c2.y)} ${at(back[i].c1.x, back[i].c1.y)} ${at(lower[i].x, lower[i].y)}`;
  return `${d}Z`;
}

/** קטע בנר: מ-`from` עד `to` (ביחידות הציר), ו-`count` = כמות הנתונים בו (או צפיפות, בנר שנבנה מרבעונים) */
export interface Seg {
  from: number;
  to: number;
  count: number;
}
/** קטע עם רמת העובי שלו (1, 3 או 5) */
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
 * רמת העובי של קטע לפי חלקו מהקטע העמוס ביותר, בשלישים: 1 מתחת לשליש, 3 משליש ועד פחות מ-⅔, 5 מ-⅔ ומעלה.
 * (בדוגמה של הבעלים, 20 משתתפים באמצע, 8 מסביב ו-2 בקצוות: 100% ⇐ 5, 40% ⇐ 3, 10% ⇐ 1.)
 */
export function segLevel(share: number): Level {
  if (!(share > 0)) return 1;
  const s = Math.min(1, share);
  return s >= 2 / 3 - 1e-9 ? 5 : s >= 1 / 3 - 1e-9 ? 3 : 1;
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
