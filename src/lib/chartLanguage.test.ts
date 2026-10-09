import { describe, expect, it } from "vitest";
import { binSegs, clipSegs, intSegs, levelSegs, quantileSegs, segLevel, valueSegs, type Seg, CANDLE_PX, maxVolume, smoothPath, sparseIndices, SVG_MARKS, volumeLevel } from "./chartLanguage";

describe("volumeLevel: עובי הנר ביחס לכל הגרף, בחמישונים", () => {
  it("1 = עד 20%, 2 = 20 עד 40, 3 = 40 עד 60, 4 = 60 עד 80, 5 = 80 עד 100", () => {
    const max = 100;
    expect([1, 10, 20].map((n) => volumeLevel(n, max))).toEqual([1, 1, 1]);
    expect([21, 30, 40].map((n) => volumeLevel(n, max))).toEqual([2, 2, 2]);
    expect([41, 50, 60].map((n) => volumeLevel(n, max))).toEqual([3, 3, 3]);
    expect([61, 70, 80].map((n) => volumeLevel(n, max))).toEqual([4, 4, 4]);
    expect([81, 90, 100].map((n) => volumeLevel(n, max))).toEqual([5, 5, 5]);
  });
  it("כשכל הנרות באותה כמות נתונים כולם ברמה 5", () => {
    expect([7, 7, 7].map((n) => volumeLevel(n, 7))).toEqual([5, 5, 5]);
  });
  it("ערכים לא תקינים: רמה 1, ומעל המקסימום: 5", () => {
    expect(volumeLevel(0, 10)).toBe(1);
    expect(volumeLevel(5, 0)).toBe(1);
    expect(volumeLevel(NaN, 10)).toBe(1);
    expect(volumeLevel(20, 10)).toBe(5);
  });
  it("עובי הנר בפיקסלים עולה ברמות", () => {
    expect(CANDLE_PX).toHaveLength(5);
    expect([...CANDLE_PX].sort((a, b) => a - b)).toEqual([...CANDLE_PX]);
    expect(SVG_MARKS.candleW).toHaveLength(5);
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
  it("segLevel: גבולות הרמות (20%, 40%, 60%, 80%)", () => {
    expect([0.05, 0.19, 0.2, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8, 1].map(segLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(segLevel(0)).toBe(1);
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
