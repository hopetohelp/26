import { describe, expect, it } from "vitest";
import { coverage, flow, flowsFor } from "./voterFlow";
import { results } from "./data";
import { results2026 } from "./guessAccuracyData";

describe("מעבר מצביעים לפי קלפי (src/data/flow2026.json)", () => {
  for (const mode of ["ballots", "localities"] as const) {
    it(`${mode}: לכל שורה יש שם, האחוזים מסתכמים ב-100, ואף קול לא יוצא מהחשבון`, () => {
      const { lists, blocs } = flowsFor(mode);
      for (const g of [lists, blocs]) {
        for (const r of [...g.cameFrom, ...g.wentTo]) {
          expect(r.name).toMatch(/[א-ת]/);
          if (r.total) expect(r.parts.reduce((a, p) => a + p.share, 0)).toBeCloseTo(100, 5);
        }
      }
      expect(blocs.cameFrom.reduce((s, r) => s + r.total, 0)).toBe(lists.cameFrom.reduce((s, r) => s + r.total, 0));
      expect(blocs.wentTo.reduce((s, r) => s + r.total, 0)).toBe(lists.wentTo.reduce((s, r) => s + r.total, 0));
      // הכרעת בעלים 28.10.2026: הסכום של כל מפלגה = הספירה הרשמית, בשני הכיוונים
      for (const [id, votes] of Object.entries(results2026.votes ?? {})) expect(lists.cameFrom.find((r) => r.id === id)?.total ?? 0).toBe(votes);
      const k25 = results.find((e) => e.knesset === 25)!;
      for (const l of flow.old.filter((x) => k25.lists.some((k) => k.letters === x))) expect(lists.wentTo.find((r) => r.id === l)?.total).toBe(k25.lists.find((k) => k.letters === l)!.votes);
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

describe("smallPct", () => {
  it("מתחת ל-0.1 לא מוצג; מתחת ל-2 עשירית; בדיוק אחוז ⇐ 1; מעל — עגול", async () => {
    const { smallPct } = await import("./voterFlow");
    expect(smallPct(0.04)).toBeNull();
    expect(smallPct(0.1)).toBe("0.1");
    expect(smallPct(0.96)).toBe("1");
    expect(smallPct(1.04)).toBe("1");
    expect(smallPct(1.46)).toBe("1.5");
    expect(smallPct(2.4)).toBe("2");
  });
});
