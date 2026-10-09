import { describe, expect, it } from "vitest";
import { dateRange, rng } from "./format";

describe("rng: טווח משמאל לימין", () => {
  it("עוטף בבידוד LTR כך שהקטן משמאל", () => {
    expect(rng(18, 27)).toBe("⁦18–27⁩");
    expect(rng("46", "58")).toBe("⁦46–58⁩");
  });
  it("תאריכים: טווח ימים באותו בידוד", () => {
    expect(dateRange("2026-09-30", "2026-10-01")).toBe("⁦30.9.2026–1.10.2026⁩");
    expect(dateRange("2026-10-01", "2026-10-01")).toBe("1.10.2026");
  });
});
