import { describe, expect, it } from "vitest";
import { change, dumbbellAxis, dumbbellSegs, type DumbbellRow } from "./dumbbell";
import modelFile from "../data/model.json";

const row = (before: number, now: number, hi: number | null = null): DumbbellRow => ({
  id: "x",
  name: "א",
  from: "ב",
  before,
  now,
  // התפלגות שמתחילה ב-now-1 ונגמרת ב-hi (תאים של 0.5): כל התאים עם תרחישים
  hist: hi === null ? null : { start: now - 1, step: 0.5, counts: Array.from({ length: Math.round((hi - now + 1) / 0.5) }, () => 1) },
  range: hi === null ? null : [now - 0.5, hi],
});

describe("dumbbellAxis", () => {
  it("לפחות 20, בצעד 5", () => {
    expect(dumbbellAxis([row(3, 4)])).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] });
  });
  it("מעל 20 עוברים לצעד 10 ומעגלים כלפי מעלה", () => {
    expect(dumbbellAxis([row(23.4, 17.4, 20.6)])).toEqual({ max: 30, ticks: [0, 10, 20, 30] });
  });
  it("הטווח העליון נכלל גם כשהוא מעל שתי הנקודות", () => {
    expect(dumbbellAxis([row(18, 19, 24.5)]).max).toBe(30);
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
      const rows = a.families.map((f, i) => ({ id: String(i), name: "", from: "", before: f.share2022, now: f.shareNow, hist: f.shareHist, range: f.shareRange ? [f.shareRange[0], f.shareRange[2]] as [number, number] : null }));
      const { max } = dumbbellAxis(rows);
      for (const r of rows) {
        expect(r.before).toBeLessThanOrEqual(max);
        expect(r.now).toBeLessThanOrEqual(max);
        expect(r.range ? r.range[1] : 0).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe("dumbbellSegs: נר מבוסס תרחישים ⇐ טווח 80%", () => {
  it("הקטעים נחתכים בדיוק לטווח, והעובי מההתפלגות", () => {
    const segs = dumbbellSegs({ hist: { start: 5, step: 0.25, counts: [1, 2, 6, 9, 6, 2, 1] }, range: [5.5, 6.25] });
    expect(segs[0].from).toBe(5.5);
    expect(segs[segs.length - 1].to).toBe(6.25);
    expect(segs.every((g) => g.from >= 5.5 && g.to <= 6.25)).toBe(true);
  });
  it("מחנה ששונה ידנית (בלי התפלגות או בלי טווח): אין נר", () => {
    expect(dumbbellSegs({ hist: null, range: null })).toEqual([]);
    expect(dumbbellSegs({ hist: { start: 0, step: 1, counts: [1] }, range: null })).toEqual([]);
  });
  it("על הנתונים האמיתיים: כל משפחה — הנר בתוך טווח 80%, והממוצע של היום בתוכו", () => {
    const alts = (modelFile as unknown as { changes: { alternatives: { families: { shareNow: number; shareRange: number[] | null; shareHist: { start: number; step: number; counts: number[] } | null }[] }[] } }).changes.alternatives;
    for (const a of alts) for (const f of a.families) {
      if (!f.shareHist || !f.shareRange) continue;
      const [lo, hi] = [f.shareRange[0], f.shareRange[2]];
      const segs = dumbbellSegs({ hist: f.shareHist, range: [lo, hi] });
      expect(segs.length).toBeGreaterThan(0);
      expect(segs[0].from).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(segs[segs.length - 1].to).toBeLessThanOrEqual(hi + 1e-9);
      expect(f.shareNow).toBeGreaterThanOrEqual(lo - 0.25);
      expect(f.shareNow).toBeLessThanOrEqual(hi + 0.25);
    }
  });
});
