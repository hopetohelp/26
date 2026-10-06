import { describe, it, expect } from "vitest";
import { detectHour, median } from "../lib/anomaly.js";
import { seats } from "./helpers.js";

const mk = (n, f = (i) => seats(i % 120)) => Array.from({ length: n }, (_, i) => ({ id: "n" + i, seats: f(i) }));

describe("anomaly rules", () => {
  it("median", () => expect(median([1, 3, 2, 10])).toBe(2.5));
  it("surge: ≥30 and ≥5× baseline (min 5)", () => {
    expect(detectHour(mk(29), []).flagged).toBe(false);
    expect(detectHour(mk(30), []).rule).toBe("surge"); // בסיס 5 ⇐ 25
    expect(detectHour(mk(30), Array(168).fill(7)).flagged).toBe(false); // 35 > 30
    expect(detectHour(mk(35), Array(168).fill(7)).flagged).toBe(true);
  });
  it("identical distribution: ≥40% and ≥15", () => {
    const same = (k) => (i) => (i < k ? seats(77) : seats(i));
    expect(detectHour(mk(20, same(15)), Array(168).fill(10)).rule).toBe("identical");
    expect(detectHour(mk(20, same(14)), Array(168).fill(10)).flagged).toBe(false);
    expect(detectHour(mk(40, same(15)), Array(168).fill(10)).flagged).toBe(false); // 37.5%
    expect(detectHour(mk(40, same(16)), Array(168).fill(10)).flagged).toBe(true);
  });
});
