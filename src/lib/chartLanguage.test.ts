import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { binSegs, CANDLE_PX, clipSegs, intSegs, levelSegs, MARK_PAD, MARK_PX, maxVolume, quantileSegs, segLevel, smoothPath, sparseIndices, SQUARE_STROKE, squarePath, squareRuns, SVG_MARKS, candleProfile, valueSegs, type LSeg, type Seg } from "./chartLanguage";

describe("עובי הנר ומידות הסימנים", () => {
  it("שלוש רמות בלבד (1, 3, 5), בעובי 4, 10 ו-16 פיקסלים", () => {
    expect(Object.keys(CANDLE_PX)).toEqual(["1", "3", "5"]);
    expect(CANDLE_PX).toEqual({ 1: 3, 3: 10, 5: 16 });
  });
  it("שטח הציור מרוחק מקצה המסלול מעבר לרדיוס העיגול, והערך זהה ב-CSS", () => {
    expect(MARK_PAD).toBeGreaterThan(MARK_PX / 2);
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    expect(css).toContain(`--mk-pad: ${MARK_PAD}px;`);
  });
  it("עיגול הממוצע ועיגול התוצאה בקוטר 22, גדולים מהנר העבה", () => {
    expect(MARK_PX).toBe(22);
    expect(MARK_PX).toBeGreaterThan(CANDLE_PX[5]);
    expect(SVG_MARKS.meanR * 2).toBe(MARK_PX);
    expect((SVG_MARKS.ringR + SVG_MARKS.ringStroke / 2) * 2).toBe(MARK_PX);
    // הטבעת ריקה: יש בה חור
    expect(SVG_MARKS.ringR - SVG_MARKS.ringStroke / 2).toBeGreaterThan(0);
  });
  it("maxVolume מתעלם מערכים חסרים", () => {
    expect(maxVolume([3, undefined, 9, NaN])).toBe(9);
    expect(maxVolume([])).toBe(0);
  });
});

describe("smoothPath: קו עם פינות עגולות", () => {
  it("בלי נקודות ריק, נקודה אחת M, שתיים קו ישר", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([{ x: 1, y: 2 }])).toBe("M1,2");
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M0,0L10,5");
  });
  it("שלוש נקודות ויותר: עקומות בזייה, ועוברת בדיוק דרך כל הנקודות", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 3 }, { x: 30, y: 9 }];
    const d = smoothPath(pts);
    expect(d.startsWith("M0,0C")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(3);
    for (const p of pts.slice(1)) expect(d).toContain(`,${p.x},${p.y}`);
  });
  it("לא חורגת מעל או מתחת לנקודות הקצה של כל קטע (מונוטונית)", () => {
    const pts = [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 0 }];
    const nums = smoothPath(pts).replace(/[MC]/g, " ").split(/[ ,]+/).filter(Boolean).map(Number);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(10);
  });
});

describe("sparseIndices: סמנים על הקו במרווח מינימלי", () => {
  it("הנקודה האחרונה תמיד כלולה והמרווח נשמר", () => {
    const xs = [0, 3, 6, 9, 12, 15, 18, 21];
    const idx = sparseIndices(xs, 8);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(xs.length - 1);
    for (let i = 1; i < idx.length; i++) expect(xs[idx[i]] - xs[idx[i - 1]]).toBeGreaterThanOrEqual(8 - 1e-9);
  });
  it("ריק ונקודה אחת", () => {
    expect(sparseIndices([], 5)).toEqual([]);
    expect(sparseIndices([4], 5)).toEqual([0]);
  });
});

describe("נר שעוביו משתנה לאורכו: קטעים לפי כמות הנתונים", () => {
  it("הדוגמה של הבעלים: 20 באמצע, 8 מסביב, 2 בקצוות ⇐ 5, 3, 1", () => {
    // 5 קטעים: קצה 2, צד 8, אמצע 20, צד 8, קצה 2 (סך הכול 40)
    const segs = intSegs([2, 8, 20, 8, 2], 24);
    const [lv] = levelSegs([segs]);
    expect(lv.map((g) => g.level)).toEqual([1, 3, 5, 3, 1]);
  });
  it("segLevel: שלישים. מתחת לשליש 1, משליש עד פחות מ-⅔ 3, מ-⅔ ומעלה 5", () => {
    expect([0.05, 0.33, 0.1, 1 / 3, 0.5, 0.66, 2 / 3, 0.9, 1, 7].map(segLevel)).toEqual([1, 1, 1, 3, 3, 3, 5, 5, 5, 5]);
    expect(segLevel(0)).toBe(1);
    expect(segLevel(NaN)).toBe(1);
  });
  it("אף רמה ביניים (2 או 4) לא נוצרת מאף חלק", () => {
    const shares = Array.from({ length: 101 }, (_, i) => i / 100);
    expect([...new Set(shares.map(segLevel))].sort()).toEqual([1, 3, 5]);
  });
  it("כברירת מחדל העובי ביחס לכל נר בנפרד (הכרעת בעלים 9.10.2026); בהיקף 'chart' ביחס לכל הגרף", () => {
    const wide: Seg[] = [{ from: 0, to: 1, count: 10 }, { from: 1, to: 2, count: 8 }];
    const narrow: Seg[] = [{ from: 0, to: 1, count: 100 }];
    const own = levelSegs([wide, narrow]);
    expect(own[0][0].level).toBe(5);
    expect(own[1][0].level).toBe(5);
    expect(levelSegs([wide, narrow], "candle")).toEqual(own);
    const all = levelSegs([wide, narrow], "chart");
    expect(all[0][0].level).toBe(1);
    expect(all[1][0].level).toBe(5);
  });
  it("נר אחד בגרף: אותו דבר בשני ההיקפים (הדוגמה של הבעלים)", () => {
    const segs = intSegs([2, 8, 20, 8, 2], 24);
    expect(levelSegs([segs])).toEqual(levelSegs([segs], "candle"));
  });
  it("valueSegs: חותך בדיוק למינימום ולמקסימום; חורים בספירה 0 מצוירים בעובי הדק ביותר", () => {
    const segs = valueSegs([25, 27, 27, 29, 29, 29]);
    expect(segs[0].from).toBe(25);
    expect(segs[segs.length - 1].to).toBe(29);
    const [lv] = levelSegs([segs]);
    expect(lv.find((g) => g.from <= 28 && g.to >= 28 && g.to - g.from > 0.4 && g.to - g.from < 1.1)?.level).toBeDefined();
    expect(Math.min(...lv.map((g) => g.level))).toBe(1);
  });
  it("intSegs: חותך בדיוק למינימום ולמקסימום, וחורים נשארים בספירה 0", () => {
    const segs = intSegs([0, 0, 3, 0, 5, 2], 10); // ערכים 12, 14, 15
    expect(segs[0]).toEqual({ from: 12, to: 12.5, count: 3 });
    expect(segs[1]).toEqual({ from: 12.5, to: 13.5, count: 0 });
    expect(segs[segs.length - 1].to).toBe(15);
    expect(intSegs([0, 0])).toEqual([]);
  });
  it("clipSegs: חיתוך לטווח 80% בלי לשנות את הספירות", () => {
    const segs = intSegs([1, 2, 3, 4, 5]); // 0..4
    const c = clipSegs(segs, 1, 3);
    expect(c[0].from).toBe(1);
    expect(c[c.length - 1].to).toBe(3);
  });
  it("quantileSegs: הצפיפות גבוהה במרכז הצר ונמוכה בזנבות", () => {
    const segs = quantileSegs([10, 18, 20, 22, 30]);
    expect(segs).toHaveLength(4);
    expect(segs[1].count).toBeGreaterThan(segs[0].count);
    const [lv] = levelSegs([segs]);
    expect(lv[1].level).toBeGreaterThan(lv[0].level);
  });
  it("binSegs: תאים רציפים לפי התחלה ורוחב", () => {
    const segs = binSegs(5, 0.25, [0, 2, 8, 2, 0]);
    expect(segs[0].from).toBe(5.25);
    expect(segs[segs.length - 1].to).toBe(6);
  });
});

/** חצי העובי הדק והעבה, וציר הנר (מחצית העובי העבה) */
const MID = CANDLE_PX[5] / 2;
const HALF_STROKE = SQUARE_STROKE / 2;

describe("הנר המרובע: קו מלא לרמה 1 וקופסה חלולה לרמות 3 ו-5", () => {
  const segs: LSeg[] = ([1, 1, 3, 5, 5, 3, 1, 1] as const).map((level, i) => ({ from: i, to: i + 1, level }));
  const map = (v: number) => v * 100;
  const runs = squareRuns(segs, map);

  it("קטעים סמוכים באותה רמה מתחברים לקטע אחד", () => {
    expect(runs.map((r) => [r.a, r.b])).toEqual([[0, 200], [200, 300], [300, 500], [500, 600], [600, 800]]);
  });
  it("רמה 1 קו מלא (4), רמות 3 ו-5 קופסה חלולה (10 ו-16)", () => {
    expect(runs.map((r) => r.filled)).toEqual([true, false, false, false, true]);
    expect(runs.map((r) => r.half * 2)).toEqual([3, 10, 16, 10, 3]);
  });
  it("אין רמת ביניים: כל קטע באחד משלושת הגדלים", () => {
    runs.forEach((r) => expect(Object.values(CANDLE_PX)).toContain(r.half * 2));
  });
  it("הקטנה (scale) מקטינה את כל העוביים ביחד", () => {
    const half = squareRuns(segs, map, 0.5);
    half.forEach((r, i) => expect(r.half).toBeCloseTo(runs[i].half / 2, 6));
  });
  it("כיוון יורד (נר אנכי) נותן אותם קטעים במיקום עולה", () => {
    const down = squareRuns(segs, (v) => 800 - v * 100);
    expect(down.map((r) => [r.a, r.b])).toEqual(runs.map((r) => [800 - r.b, 800 - r.a]).reverse());
    expect(down.map((r) => r.half)).toEqual(runs.map((r) => r.half).reverse());
  });
  it("המלבן סגור, בזוויות ישרות, והגודל החיצוני עם המסגרת בדיוק 4, 10 או 16", () => {
    const d = squarePath(runs[2], MID);
    expect(d).toBe(`M300,${MID - (MID - HALF_STROKE)}L500,${MID - (MID - HALF_STROKE)}L500,${MID + (MID - HALF_STROKE)}L300,${MID + (MID - HALF_STROKE)}Z`);
    expect(d.match(/L/g)).toHaveLength(3);
    // גובה הנתיב + עובי המסגרת = הגודל המלא
    expect(2 * (MID - HALF_STROKE) + SQUARE_STROKE).toBe(CANDLE_PX[5]);
  });
  it("נר אנכי מחליף בין הצירים", () => {
    expect(squarePath({ a: 10, b: 50, half: 8, filled: false }, MID, "x").startsWith(`M${MID - (8 - HALF_STROKE)},10L`)).toBe(true);
  });
  it("בלי קטעים: ריק; קטע בודד: קופסה אחת", () => {
    expect(squareRuns([], map)).toEqual([]);
    expect(squareRuns([{ from: 0, to: 2, level: 5 }], map)).toEqual([{ a: 0, b: 200, half: 8, filled: false }]);
  });
  it("כל הקטעים דקים: קו מלא אחד", () => {
    expect(squareRuns(([1, 1, 1] as const).map((level, i) => ({ from: i, to: i + 1, level })), map)).toEqual([{ a: 0, b: 300, half: 1.5, filled: true }]);
  });
});

describe("candleProfile: אחוזונים, ושני אזורים לשתי קבוצות (הכרעת בעלים 11.10.2026)", () => {
  const vals = (xs: number[]) => candleProfile(valueSegs(xs));
  it("דק 9.5%, בינוני 27%, עבה 27% באמצע — בסדר הזה, מהנמוך עד הגבוה", () => {
    const segs = vals([46, 47, 47, 48, 49, 49, 50, 51, 52, 53]);
    expect(segs.map((g) => g.level)).toEqual([1, 3, 5, 3, 1]);
    expect(segs[0].from).toBe(46);
    expect(segs[segs.length - 1].to).toBe(53);
    for (let i = 1; i < segs.length; i++) expect(segs[i].from).toBeCloseTo(segs[i - 1].to, 9);
  });
  it("שתי קבוצות של לפחות 25% עם פער ריק ⇐ שני נרות מחוברים בקו דק", () => {
    const segs = vals([45, 46, 46, 47, 47, 60, 61, 61, 62]);
    const thick = segs.filter((g) => g.level === 5);
    expect(thick).toHaveLength(2);
    expect(thick[0].to).toBeLessThan(50);
    expect(thick[1].from).toBeGreaterThan(55);
  });
  it("שני סקרים חריגים רחוקים זה מזה אינם קבוצה, גם כשהם 25%", () => {
    expect(vals([46, 47, 48, 48, 49, 49, 56, 64]).filter((g) => g.level === 5)).toHaveLength(1);
  });
  it("סקר חריג אחד (פחות מ-25%) אינו קבוצה: נר אחד עם קצה דק ארוך", () => {
    const segs = vals([45, 46, 46, 47, 47, 48, 48, 49, 64]);
    expect(segs.filter((g) => g.level === 5)).toHaveLength(1);
    expect(segs[segs.length - 1]).toMatchObject({ to: 64, level: 1 });
  });
  it("ערך יחיד — נר זעיר סביב הערך, עם ליבה עבה", () => {
    const segs = vals([50]);
    expect(segs.some((g) => g.level === 5)).toBe(true);
    expect(segs[0].from).toBeGreaterThan(49.5);
    expect(segs[segs.length - 1].to).toBeLessThan(50.5);
  });
});
