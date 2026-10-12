import { describe, expect, it } from "vitest";
import { change, dumbbellAxis, pollSegs, type DumbbellRow } from "./dumbbell";
import { LATEST_POLLS } from "./homeData";
import { pollSeatRange, pollSeatValues } from "./pollRange";
import { pctForListSeats } from "../pages/guess/pctSync";
import { lists2026 } from "./data";
import modelFile from "../data/model.json";

const row = (before: number, now: number, hi: number | null = null): DumbbellRow => ({
  id: "x",
  name: "א",
  from: "ב",
  before,
  now,
  segs: hi === null ? [] : [{ from: now - 0.5, to: hi, count: 1 }],
  range: hi === null ? null : [now - 0.5, hi],
});

describe("dumbbellAxis: לפי הטווח הדרוש, עם רווח משני הצדדים", () => {
  it("לא מתחיל ב-0 כשאין צורך, וכל הערכים בפנים עם רווח", () => {
    const a = dumbbellAxis([row(23.4, 17.4, 20.6)]);
    expect(a.min).toBeGreaterThan(0);
    expect(a.min).toBeLessThan(17.4);
    expect(a.max).toBeGreaterThan(23.4);
    expect(a.ticks[0]).toBe(a.min);
    expect(a.ticks[a.ticks.length - 1]).toBe(a.max);
    expect(a.ticks.length).toBeGreaterThanOrEqual(2);
    expect(a.ticks.length).toBeLessThanOrEqual(6);
  });
  it("טווח צר — צעד קטן; לא יורד מתחת ל-0", () => {
    const a = dumbbellAxis([row(3, 4)]);
    expect(a.ticks[1] - a.ticks[0]).toBeLessThanOrEqual(2);
    expect(dumbbellAxis([row(0, 6)], "seats").min).toBe(0);
  });
  it("מנדטים: טווח רחב — צעד גדול", () => {
    const a = dumbbellAxis([row(4, 32)], "seats");
    expect(a.min).toBe(0);
    expect(a.max).toBeGreaterThanOrEqual(32);
    expect(a.ticks.length).toBeLessThanOrEqual(6);
  });
});

describe("change", () => {
  it("מעוגל לעשירית ועם סימן נכון", () => {
    expect(change({ before: 9.1, now: 18.2 })).toBe(9.1);
    expect(change({ before: 23.4, now: 17.4 })).toBe(-6);
    expect(change({ before: 5, now: 5.04 })).toBe(0);
  });
});

describe("על הנתונים האמיתיים", () => {
  it("כל משפחה בכל חלופה נכנסת לציר", () => {
    const alts = (modelFile as unknown as { changes: { alternatives: { families: { share2022: number; shareNow: number; shareRange: number[] | null; shareHist: { start: number; step: number; counts: number[] } | null }[] }[] } }).changes.alternatives;
    for (const a of alts) {
      const rows = a.families.map((f, i) => ({ id: String(i), name: "", from: "", before: f.share2022, now: f.shareNow, segs: [], range: f.shareRange ? [f.shareRange[0], f.shareRange[2]] as [number, number] : null }));
      const { min, max } = dumbbellAxis(rows);
      for (const r of rows) {
        expect(r.before).toBeLessThanOrEqual(max);
        expect(r.now).toBeLessThanOrEqual(max);
        expect(r.range ? r.range[1] : 0).toBeLessThanOrEqual(max);
        expect(Math.min(r.before, r.now, ...(r.range ?? []))).toBeGreaterThanOrEqual(min);
      }
    }
  });
});

describe("pollSegs: נר של טווח הסקרים (הכרעה 6) ⇐ טווח מלא", () => {
  it("מנדטים: מהסקר הנמוך עד הגבוה, והעובי לפי כמה סקרים נותנים כל ערך", () => {
    const segs = pollSegs([20, 21, 21, 22, 24]);
    expect(segs[0].from).toBe(20);
    expect(segs[segs.length - 1].to).toBe(24);
    expect(segs.find((g) => g.from <= 21 && g.to >= 21)!.count).toBe(2);
  });
  it("אחוזים: הקצוות מומרים, ובין מנדטים שלמים — אינטרפולציה; הטווח נמתח עד הממוצע", () => {
    const toPct = (s: number) => s * 0.8;
    const segs = pollSegs([10, 12], toPct, [7.5, 9.6]);
    expect(segs[0].from).toBe(7.5);
    expect(segs[segs.length - 1].to).toBeCloseTo(9.6);
    expect(segs[1].from).toBeCloseTo(10.5 * 0.8);
  });
  it("המרה שנכשלה ⇐ אין נר; בלי סקרים ⇐ אין נר", () => {
    expect(pollSegs([10, 12], () => null)).toEqual([]);
    expect(pollSegs([])).toEqual([]);
  });
  it("על הנתונים האמיתיים: הנר במנדטים הוא בדיוק pollSeatRange, ובאחוזים — ההמרה לפי החוק", () => {
    for (const l of lists2026) {
      const vals = pollSeatValues(LATEST_POLLS, [l.id]);
      const r = pollSeatRange(LATEST_POLLS, [l.id]);
      if (!r) continue;
      const segs = pollSegs(vals);
      expect(Math.min(segs[0].from + (r[0] === r[1] ? 0.25 : 0), r[0])).toBe(r[0]);
      if (r[0] !== r[1]) expect([segs[0].from, segs[segs.length - 1].to]).toEqual(r);
      const pLo = pctForListSeats(l.id, r[0]), pHi = pctForListSeats(l.id, r[1]);
      if (pLo === null || pHi === null || r[0] === r[1]) continue;
      const pseg = pollSegs(vals, (s) => pctForListSeats(l.id, s));
      expect(pseg[0].from).toBeCloseTo(pLo);
      expect(pseg[pseg.length - 1].to).toBeCloseTo(pHi);
    }
  });
});
