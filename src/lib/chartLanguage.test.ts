import { describe, expect, it } from "vitest";
import { binSegs, CANDLE_PX, clipSegs, intSegs, levelSegs, MARK_PX, maxVolume, profilePath, profilePoints, quantileSegs, segLevel, smoothPath, sparseIndices, SVG_MARKS, valueSegs, type LSeg, type Seg } from "./chartLanguage";

describe("עובי הנר ומידות הסימנים", () => {
  it("שלוש רמות בלבד (1, 3, 5), בעובי 3, 10 ו-18 פיקסלים", () => {
    expect(Object.keys(CANDLE_PX)).toEqual(["1", "3", "5"]);
    expect(CANDLE_PX).toEqual({ 1: 3, 3: 10, 5: 18 });
  });
  it("עיגול הממוצע ועיגול התוצאה בגודל עובי רמה 3 (קוטר 10)", () => {
    expect(MARK_PX).toBe(CANDLE_PX[3]);
    expect(SVG_MARKS.meanR * 2).toBe(MARK_PX);
    expect((SVG_MARKS.ringR + SVG_MARKS.ringStroke / 2) * 2).toBe(MARK_PX);
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
  it("כברירת מחדל כל נר ביחס לעצמו; בהיקף 'chart' ביחס לכל הגרף", () => {
    const wide: Seg[] = [{ from: 0, to: 1, count: 10 }, { from: 1, to: 2, count: 8 }];
    const narrow: Seg[] = [{ from: 0, to: 1, count: 100 }];
    const own = levelSegs([wide, narrow]);
    expect(own[0][0].level).toBe(5);
    expect(own[1][0].level).toBe(5);
    const all = levelSegs([wide, narrow], "chart");
    expect(all[0][0].level).toBe(1);
    expect(all[1][0].level).toBe(5);
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

describe("קו המתאר של הנר: מעבר מעוגל בין העוביים", () => {
  const segs: LSeg[] = ([1, 1, 3, 5, 5, 3, 1, 1] as const).map((level, i) => ({ from: i, to: i + 1, level }));
  const map = (v: number) => v * 100;
  const pts = profilePoints(segs, map);
  const hs = pts.map((p) => p.h);

  it("מתחיל ונגמר בקצוות הנר, במיקום עולה", () => {
    expect(pts[0].t).toBe(0);
    expect(pts[pts.length - 1].t).toBe(800);
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
  });
  it("הקצוות בעובי הדק (3), והקטע העמוס ביותר בעובי המלא (18)", () => {
    expect(hs[0]).toBeCloseTo(CANDLE_PX[1] / 2, 6);
    expect(hs[hs.length - 1]).toBeCloseTo(CANDLE_PX[1] / 2, 6);
    expect(Math.max(...hs)).toBeCloseTo(CANDLE_PX[5] / 2, 6);
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(CANDLE_PX[1] / 2 - 1e-9);
  });
  it("העובי עולה בהדרגה מהקצה אל האמצע: אין קפיצה מרובעת בין דק לעבה", () => {
    const peak = hs.indexOf(Math.max(...hs));
    const maxStep = Math.max(...hs.slice(1).map((h, i) => Math.abs(h - hs[i])));
    expect(peak).toBeGreaterThan(0);
    expect(maxStep).toBeLessThan((CANDLE_PX[5] - CANDLE_PX[1]) / 2 / 2.5);
    // בצד העולה לעולם לא יורד (חלק, בלי נקיקים)
    for (let i = 1; i <= peak; i++) expect(hs[i]).toBeGreaterThanOrEqual(hs[i - 1] - 1e-6);
  });
  it("העובי בקטע בינוני נמצא בין הדק לעבה", () => {
    const at = (t: number) => pts.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best)).h;
    expect(at(250)).toBeGreaterThan(CANDLE_PX[1] / 2 + 0.5);
    expect(at(250)).toBeLessThan(CANDLE_PX[5] / 2 - 0.5);
  });
  it("הקטנה (scale) מקטינה את כל העוביים ביחד", () => {
    const half = profilePoints(segs, map, 0.5).map((p) => p.h);
    half.forEach((h, i) => expect(h).toBeCloseTo(hs[i] / 2, 6));
  });
  it("הכיוון היורד (נר אנכי) נותן את אותה צורה במיקום עולה", () => {
    const down = profilePoints(segs, (v) => 800 - v * 100);
    expect(down.map((p) => p.t)).toEqual(pts.map((p) => p.t));
    down.forEach((p, i) => expect(p.h).toBeCloseTo(hs[hs.length - 1 - i], 3));
  });
  it("הצורה סגורה ובנויה מעקומות בזייה בשני הצדדים", () => {
    const d = profilePath(pts, 9);
    expect(d.startsWith("M0,7.5C")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2 * (pts.length - 1));
    expect(d.match(/L/g)).toHaveLength(1);
  });
  it("מתאר סימטרי סביב הציר ואינו חורג מהעובי העבה ביותר", () => {
    const d = profilePath(pts, 9);
    const ys = d.replace(/[MCLZ]/g, " ").split(/[ ,]+/).filter(Boolean).map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(18 + 1e-6);
    expect(Math.min(...ys)).toBeCloseTo(18 - Math.max(...ys), 1);
  });
  it("נר אנכי מחליף בין הצירים; בלי קטעים: ריק", () => {
    expect(profilePath(pts, 9, "x").startsWith("M7.5,0C")).toBe(true);
    expect(profilePath([], 9)).toBe("");
    expect(profilePoints([], map)).toEqual([]);
  });
  it("קטע בודד עבה מצויר כציר סימטרי עם קצוות דקים", () => {
    const one = profilePoints([{ from: 0, to: 2, level: 5 }], map).map((p) => p.h);
    expect(one[0]).toBeCloseTo(1.5, 6);
    expect(one[one.length - 1]).toBeCloseTo(1.5, 6);
    expect(Math.max(...one)).toBeCloseTo(9, 6);
    expect(one[Math.floor(one.length / 2)]).toBeCloseTo(9, 0);
  });
  it("כל הקטעים דקים: נר דק בעובי אחד", () => {
    const thin = profilePoints(([1, 1, 1] as const).map((level, i) => ({ from: i, to: i + 1, level })), map).map((p) => p.h);
    thin.forEach((h) => expect(h).toBeCloseTo(1.5, 6));
  });
});
