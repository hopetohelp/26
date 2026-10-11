/**
 * שפת הציור האחידה של כל הגרפים (הכרעת בעלים 9.10.2026). ארבעה סימנים, וכל אחד משמעותו אחת בכל האתר:
 * - **טווח** = נר: פס מהנמוך אל הגבוה, **שעוביו משתנה לאורכו** לפי כמות הנתונים בכל קטע: עבה היכן שרוב הנתונים, דק בקצוות.
 *   העובי בשלוש רמות **ביחס לקטע העמוס ביותר באותו נר** (כל נר בנפרד; הכרעת בעלים 9.10.2026, אחרי ניסיון של "ביחס לכל הגרף"): מתחת לשליש רמה 1 (דק, 3 פיקסלים; היה 4 עד 11.10.2026), משליש רמה 3 (בינוני, 10), מ-⅔ רמה 5 (עבה, 16). (הכרעת בעלים 9.10.2026; היה 3, 10, 18.)
 *   (הרמות הן 1, 3 ו-5 כדי לשמור את שמות הרמות מההכרעה; רמות 2 ו-4 בוטלו, 9.10.2026.)
 *   הנר **מרובע** (כמו נר יפני; הכרעת בעלים 9.10.2026): רמה 1 קו מלא, ורמות 3 ו-5 קופסה סגורה וחלולה (`squareRuns`, `squarePath`).
 *   דוגמה (הבעלים): נר אחד בגרף, 20 משתתפים בין 28 ל-30, 8 בין 26 ל-32, 2 בין 24 ל-34 ⇐ באמצע 5, מהצדדים 3, ובקצוות 1.
 *   כל נר מראה את הצורה שלו: עבה היכן שרוב הנתונים בו, דק בקצוות. אפשר גם ביחס לכל הגרף (`levelSegs(…, "chart")`, כמו נרות ווליום; היה ברירת המחדל זמן קצר ב-9.10.2026 ובוטל).
 *   הנר נבנה מקטעים (`Seg`): מהתפלגות של מספרים שלמים (`intSegs`), מרשימת ערכים (`valueSegs`), מתאים רציפים (`binSegs`) או מרבעונים (`quantileSegs`).
 * - **ממוצע** = עיגול ריק ירוק בקוטר 22 (הכרעת בעלים 11.10.2026; היה מלא כתום), **גדול מהנר העבה** (`MARK_PX`; הכרעת בעלים 9.10.2026).
 * - **תוצאה (מציאות)** = עיגול ריק שחור בקוטר חיצוני 22, גדול מהנר העבה. גם ממוצע המשתתפים בסקר האתר (שאינו סקר) מצויר כך.
 * - **סמן על קו** = עיגול קטן ריק (עובי 2). גרף מגמה הוא תמיד קו, עם סמנים כאלה.
 * - צבע לכל סימן (הכרעת בעלים 9.10.2026): טווח כחול, סמן על קו שחור, ממוצע ירוק, תוצאה אדומה חזקה (עיגולים ריקים; הכרעת בעלים 11.10.2026). טוקנים `--mk-*` ב-`src/index.css`; בלי קו לבן מסביב לסימנים.
 *   הגדלים כאן הם מקור אחד ל-SVG ול-HTML (`src/index.css`, מחלקות `mk-*`).
 */
export type Level = 1 | 3 | 5;

/** עובי הנר בפיקסלים לפי הרמה: דק, בינוני, עבה */
export const CANDLE_PX: Readonly<Record<Level, number>> = { 1: 3, 3: 10, 5: 16 };

/** קוטר עיגול הממוצע והתוצאה: גדול מהנר העבה (הכרעת בעלים 9.10.2026) */
export const MARK_PX = 22;

/**
 * הרווח בין קצה המסלול לקצה שטח הציור, בפיקסלים: חצי קוטר העיגול ועוד 3. כך עיגול בקצה הציר (למשל 0 מנדטים) לא חורג אל עמודת
 * המספרים או הטקסט שלידו (הכרעת בעלים 9.10.2026). אותו ערך ב-`--mk-pad` ב-`src/index.css` (בדיקה מוודאת).
 */
export const MARK_PAD = MARK_PX / 2 + 3;

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

/** עובי מסגרת הקופסה בנר, בפיקסלים */
export const SQUARE_STROKE = 1.5;

/** קטע רצוף בנר באותה רמה: מ-`a` עד `b` (במיקום לאורך הנר), מחצית העובי הכולל `half`, ו-`filled` = קו מלא (רמה 1) ולא קופסה חלולה */
export interface SquareRun {
  a: number;
  b: number;
  half: number;
  filled: boolean;
}

/**
 * הנר המרובע (הכרעת בעלים 9.10.2026, כמו נר יפני): הקטעים הסמוכים באותה רמה מתחברים לקטע אחד. רמה 1 היא **קו מלא** (3 פיקסלים),
 * ורמות 3 ו-5 הן **קופסה סגורה וחלולה** (מסגרת בלבד, 10 ו-16 פיקסלים). הקטעים מצוירים זה ליד זה בזוויות ישרות, בלי החלקה.
 * `map` ממפה ערך על הציר למיקום לאורך הנר, בכל כיוון (גם יורד, בנר אנכי). `scale` מקטין את כל העוביים יחד (בנרות צפופים).
 */
export function squareRuns(segs: LSeg[], map: (v: number) => number, scale = 1): SquareRun[] {
  const out: (SquareRun & { level: Level })[] = [];
  const ordered = segs
    .map((g) => {
      const a = map(g.from);
      const b = map(g.to);
      return { a: Math.min(a, b), b: Math.max(a, b), level: g.level };
    })
    .sort((x, y) => x.a - y.a);
  for (const g of ordered) {
    const last = out[out.length - 1];
    if (last && last.level === g.level) last.b = g.b;
    else out.push({ a: g.a, b: g.b, half: (CANDLE_PX[g.level] / 2) * scale, filled: g.level === 1, level: g.level });
  }
  return out.map(({ a, b, half, filled }) => ({ a, b, half, filled }));
}

/**
 * מלבן סגור של קטע, סביב ציר ב-`mid`. המלבן מוקטן במחצית עובי המסגרת, כך שהגודל החיצוני (המסגרת כלולה) הוא בדיוק 4, 10 או 16.
 * `across`: "y" = נר אופקי (`a` ו-`b` הם x), "x" = נר אנכי (`a` ו-`b` הם y). מחזירה את תכונת `d` של path.
 */
export function squarePath(run: SquareRun, mid: number, across: "x" | "y" = "y"): string {
  const h = Math.max(run.half - SQUARE_STROKE / 2, 0.25);
  const at = (t: number, s: number) => (across === "y" ? `${f2(t)},${f2(s)}` : `${f2(s)},${f2(t)}`);
  return `M${at(run.a, mid - h)}L${at(run.b, mid - h)}L${at(run.b, mid + h)}L${at(run.a, mid + h)}Z`;
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
 * - "candle" (ברירת המחדל, הכרעת בעלים 9.10.2026): ביחס לקטע העמוס ביותר באותו נר, כך שכל נר מראה את הצורה שלו: עבה היכן שרוב הנתונים, דק בקצוות.
 * - "chart": ביחס לקטע העמוס ביותר בכל הגרף (כל הנרות יחד), כמו נרות ווליום: נר רחב ופזור נראה דק כולו. לא בשימוש כרגע.
 */
export function levelSegs(all: Seg[][], scope: "candle" | "chart" = "candle"): LSeg[][] {
  const chartMax = maxVolume(all.flatMap((segs) => segs.map((g) => g.count)));
  return all.map((segs) => {
    const max = scope === "chart" ? chartMax : maxVolume(segs.map((g) => g.count));
    return segs.map((g) => ({ from: g.from, to: g.to, level: segLevel(max > 0 ? g.count / max : 0) }));
  });
}

/**
 * הנר באתר (הכרעת בעלים 11.10.2026, שילוב של אחוזונים וקבוצות): הנר נבנה לפי סדר הנתונים מהנמוך לגבוה, לא לפי ספירה בכל ערך.
 * - **אחוזונים**: 9% הנמוכים ו-9% הגבוהים — קו דק; 27% האמצעיים — קופסה עבה; ביניהם (27.5% מכל צד) — קופסה בינונית.
 * - **שתי קבוצות** (לא שלוש): כשיש פער ריק (בלי נתונים) של לפחות `CLUSTER_GAP` מאורך הנר, ובכל צד שלו לפחות `CLUSTER_MIN` מהנתונים,
 *   כל צד מצויר כנר משלו (באותם אחוזונים) והם מחוברים בקו דק — כמו שני נרות מחוברים. לכל היותר שני אזורים.
 * `density`: הספירה בכל קטע היא צפיפות (נר מרבעונים), ולכן המשקל הוא צפיפות × רוחב.
 */
export const CANDLE_TAIL = 0.09;
export const CANDLE_CORE = 0.27;
export const CLUSTER_MIN = 0.25;
export const CLUSTER_GAP = 0.2;

type W = { from: number; to: number; w: number };
function weighted(segs: Seg[], density: boolean): W[] {
  return segs
    .map((g) => ({ from: Math.min(g.from, g.to), to: Math.max(g.from, g.to), w: Math.max(0, density ? g.count * Math.abs(g.to - g.from) : g.count) }))
    .sort((a, b) => a.from - b.from);
}
/** הערך שמתחתיו `p` מהמשקל (אינטרפולציה לינארית בתוך הקטע) */
function quantileOf(ws: W[], p: number): number {
  const tot = ws.reduce((a, g) => a + g.w, 0);
  let acc = 0;
  const t = p * tot;
  for (const g of ws) {
    if (g.w > 0 && acc + g.w >= t - 1e-12) return g.from + (g.to - g.from) * Math.min(1, Math.max(0, (t - acc) / g.w));
    acc += g.w;
  }
  return ws[ws.length - 1].to;
}
/** נר אחד לפי אחוזונים, מהקצה הנמוך של הנתונים ועד הגבוה */
function percentileOne(ws: W[]): LSeg[] {
  const occ = ws.filter((g) => g.w > 0);
  if (!occ.length) return [];
  const lo = occ[0].from, hi = occ[occ.length - 1].to;
  if (hi - lo < 1e-9) return [{ from: lo - 0.25, to: hi + 0.25, level: 5 }];
  const a = CANDLE_TAIL, b = 0.5 - CANDLE_CORE / 2;
  const [t0, c0, c1, t1] = [a, b, 1 - b, 1 - a].map((p) => quantileOf(occ, p));
  const parts: LSeg[] = [
    { from: lo, to: t0, level: 1 },
    { from: t0, to: c0, level: 3 },
    { from: c0, to: c1, level: 5 },
    { from: c1, to: t1, level: 3 },
    { from: t1, to: hi, level: 1 },
  ].filter((g) => g.to - g.from > 1e-9) as LSeg[];
  if (!parts.some((g) => g.level === 5)) {
    // הליבה העבה תמיד נראית, גם כשהאמצע הוא ערך אחד
    const m = quantileOf(occ, 0.5), half = Math.max((hi - lo) * 0.015, 0.125);
    return [...parts.flatMap((g) => (g.from <= m && g.to >= m ? [{ ...g, to: m - half }, { from: m - half, to: m + half, level: 5 as Level }, { ...g, from: m + half }] : [g])).filter((g) => g.to - g.from > 1e-9)];
  }
  return parts;
}
/** נר לפי אחוזונים, עם פיצול לשני אזורים כשיש שתי קבוצות נפרדות */
export function candleProfile(segs: Seg[], density = false, minGap = CLUSTER_GAP): LSeg[] {
  const ws = weighted(segs, density).filter((g) => g.to > g.from || g.w > 0);
  const occ = ws.filter((g) => g.w > 0);
  if (!occ.length) return [];
  const tot = occ.reduce((a, g) => a + g.w, 0);
  const lo = occ[0].from, hi = occ[occ.length - 1].to, len = hi - lo;
  let best: { at: number; gap: number } | null = null;
  let acc = 0;
  for (let k = 0; k + 1 < occ.length; k++) {
    acc += occ[k].w;
    const gap = occ[k + 1].from - occ[k].to;
    if (gap > 1e-9 && gap >= minGap * len - 1e-9 && acc / tot >= CLUSTER_MIN - 1e-9 && 1 - acc / tot >= CLUSTER_MIN - 1e-9 && (!best || gap > best.gap)) best = { at: k, gap };
  }
  if (!best) return percentileOne(occ);
  const left = percentileOne(occ.slice(0, best.at + 1));
  const right = percentileOne(occ.slice(best.at + 1));
  const a = left[left.length - 1].to, b = right[0].from;
  return [...left, ...(b > a ? [{ from: a, to: b, level: 1 as Level }] : []), ...right];
}
/** אותו נר לכל קבוצת קטעים (מקור אחד לכל הגרפים) */
export const candleProfiles = (all: Seg[][], density = false): LSeg[][] => all.map((segs) => candleProfile(segs, density));

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
