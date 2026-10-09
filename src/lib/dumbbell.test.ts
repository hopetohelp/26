import { describe, expect, it } from "vitest";
import { change, dumbbellAxis, type DumbbellRow } from "./dumbbell";
import modelFile from "../data/model.json";

const row = (before: number, now: number, hi: number | null = null): DumbbellRow => ({
  id: "x",
  name: "א",
  from: "ב",
  before,
  now,
  range: hi === null ? null : [now - 1, hi],
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
    const alts = (modelFile as unknown as { changes: { alternatives: { families: { share2022: number; shareNow: number; shareRange: number[] | null }[] }[] } }).changes.alternatives;
    for (const a of alts) {
      const rows = a.families.map((f, i) => ({ id: String(i), name: "", from: "", before: f.share2022, now: f.shareNow, range: f.shareRange ? ([f.shareRange[0], f.shareRange[2]] as [number, number]) : null }));
      const { max } = dumbbellAxis(rows);
      for (const r of rows) {
        expect(r.before).toBeLessThanOrEqual(max);
        expect(r.now).toBeLessThanOrEqual(max);
        expect(r.range?.[1] ?? 0).toBeLessThanOrEqual(max);
      }
    }
  });
});
