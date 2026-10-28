import { describe, expect, it } from "vitest";
import { cameFrom, flow, wentTo } from "./voterFlow";

describe("מעבר מצביעים לפי קלפי (src/data/flow2026.json)", () => {
  it("לכל רשימה של 2022 ושל 2026 יש שם, ואחוזי המקורות מסתכמים ב-100", () => {
    for (const r of [...cameFrom, ...wentTo]) {
      expect(r.name).toMatch(/[א-ת]/);
      if (r.total) expect(r.parts.reduce((a, p) => a + p.share, 0)).toBeCloseTo(100, 5);
    }
  });
  it("סכום כל המעברים = סכום כל הרשימות בשתי הכיוונים", () => {
    const a = cameFrom.reduce((s, r) => s + r.total, 0), b = wentTo.reduce((s, r) => s + r.total, 0);
    expect(a).toBe(b);
    expect(flow.ballots).toBeGreaterThan(1000);
  });
});
