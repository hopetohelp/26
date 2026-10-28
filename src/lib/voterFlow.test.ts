import { describe, expect, it } from "vitest";
import { coverage, flowsFor } from "./voterFlow";

describe("מעבר מצביעים לפי קלפי (src/data/flow2026.json)", () => {
  for (const mode of ["ballots", "localities"] as const) {
    it(`${mode}: לכל שורה יש שם, האחוזים מסתכמים ב-100, והסכומים זהים בשני הכיוונים`, () => {
      const { lists, blocs } = flowsFor(mode);
      for (const g of [lists, blocs]) {
        for (const r of [...g.cameFrom, ...g.wentTo]) {
          expect(r.name).toMatch(/[א-ת]/);
          if (r.total) expect(r.parts.reduce((a, p) => a + p.share, 0)).toBeCloseTo(100, 5);
        }
        expect(g.cameFrom.reduce((s, r) => s + r.total, 0)).toBe(g.wentTo.reduce((s, r) => s + r.total, 0));
      }
      expect(blocs.cameFrom.reduce((s, r) => s + r.total, 0)).toBe(lists.cameFrom.reduce((s, r) => s + r.total, 0));
    });
  }
  it("הכיסוי עולה מדרגה לדרגה, והיישובים מכסים יותר מהקלפיות", () => {
    const b = coverage("ballots"), l = coverage("localities");
    expect(b.sub).toBeLessThanOrEqual(b.ballot);
    expect(b.ballot).toBeLessThanOrEqual(b.total);
    expect(l.total).toBeGreaterThanOrEqual(b.total);
    expect(l.total).toBeLessThanOrEqual(100);
  });
});
