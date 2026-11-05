import { describe, expect, it } from "vitest";
import { labelIndexesByX, thinCandles, trendAxis, visibleLines } from "./trendAxis";

describe("trendAxis", () => {
  it("קווים כל 5, והתחום מכסה את הערכים", () => {
    const a = trendAxis([45, 51.5, 64]);
    expect(a.lo).toBe(45);
    expect(a.hi).toBe(65);
    expect(a.lines.map((l) => l.v)).toEqual([45, 50, 55, 61, 65]);
  });
  it("בגוש: 61 במקום 60, בשחור", () => {
    const a = trendAxis([45, 51.5, 64], { majority: 61 });
    expect(a.lines.map((l) => l.v)).toEqual([45, 50, 55, 61, 65]);
    expect(a.lines.filter((l) => l.major).map((l) => l.v)).toEqual([61]);
  });
  it("61 רק אם הגוש עבר 55", () => {
    expect(trendAxis([40, 55], { majority: 61 }).lines.some((l) => l.major)).toBe(false);
    expect(trendAxis([40, 56], { majority: 61 }).lines.some((l) => l.major && l.v === 61)).toBe(true);
  });
  it("גוש קטן לא מותח את הציר עד 61", () => {
    const a = trendAxis([8, 14, 21], { majority: 61 });
    expect(a.hi).toBe(25);
    expect(a.lines.some((l) => l.major)).toBe(false);
  });
  it("רוב קרוב מעל הנתונים (עברו 55) מרחיב את התחום", () => {
    const a = trendAxis([50, 58], { majority: 61 });
    expect(a.lines.some((l) => l.major && l.v === 61)).toBe(true);
    expect(a.hi).toBeGreaterThanOrEqual(61);
  });
  it("תחום רחב מדי — הצעד גדל", () => {
    const a = trendAxis([0, 100]);
    expect(a.lines.length).toBeLessThanOrEqual(15);
  });
  it("ערכים ריקים לא שוברים", () => {
    expect(trendAxis([]).lines.length).toBeGreaterThan(1);
  });
});

describe("thinCandles", () => {
  const day = 86_400_000;
  const pts = Array.from({ length: 31 }, (_, i) => ({ t: i * 3 * day }));
  it("יש מקום — הכול", () => expect(thinCandles(pts, 3000, 20)).toHaveLength(31));
  it("אין מקום — מדללים, והאחרון נשאר", () => {
    const out = thinCandles(pts, 300, 20);
    expect(out.length).toBeLessThan(31);
    expect(out[out.length - 1]).toBe(pts[pts.length - 1]);
    for (let i = 1; i < out.length; i++) expect(((out[i].t - out[i - 1].t) / (pts[30].t - pts[0].t)) * 300).toBeGreaterThanOrEqual(20 - 1e-9);
  });
});

describe("visibleLines", () => {
  const lines = [10, 15, 20, 25, 30, 35].map((v) => ({ v, major: false }));
  it("קו בלי נתונים בשתי הרצועות שלידו נעלם", () => {
    // נתונים רק ב-10–15 וב-30–35: הקווים 20 ו-25 אינם נוגעים ברצועה מאוכלסת
    expect(visibleLines(lines, [[11, 13], [31, 34]]).map((l) => l.v)).toEqual([10, 15, 30, 35]);
  });
  it("נתון שחוצה כמה רצועות מאכלס את כולן", () => {
    expect(visibleLines(lines, [[11, 29]]).map((l) => l.v)).toEqual([10, 15, 20, 25, 30]);
  });
  it("בלי נתונים — כל הקווים", () => expect(visibleLines(lines, [])).toHaveLength(6));
  it("טווח מעל 30: קו כל 10, ו-61 במקום 60", () => {
    expect(trendAxis([5, 54]).lines.map((l) => l.v)).toEqual([0, 10, 20, 30, 40, 50, 61]);
  });
});

describe("labelIndexesByX", () => {
  it("תאריכים צפופים אינם חופפים: כל שתי תוויות במרחק 46 לפחות, הראשונה והאחרונה תמיד", () => {
    const xs = [0, 3, 5, 8, 40, 41, 43, 100, 101, 102, 103, 200, 201, 300];
    const lab = labelIndexesByX(xs, 46);
    expect(lab[0]).toBe(0);
    expect(lab[lab.length - 1]).toBe(xs.length - 1);
    for (let k = 1; k < lab.length; k++) expect(xs[lab[k]] - xs[lab[k - 1]]).toBeGreaterThanOrEqual(46);
  });
  it("נקודה אחת או אין", () => { expect(labelIndexesByX([5], 46)).toEqual([0]); expect(labelIndexesByX([], 46)).toEqual([]); });
  it("מרווחים גדולים — כולן", () => expect(labelIndexesByX([0, 50, 100, 150], 46)).toEqual([0, 1, 2, 3]));
});
