import { describe, expect, it } from "vitest";
import { IDS, POLL_RANGES, POLL_SHARES } from "./model";
import { pctForListSeats } from "./pctSync";

describe("pctForListSeats", () => {
  it("כל קצוות טווח הסקרים מומרים לאחוזים עולים וסבירים", () => {
    for (const id of IDS) {
      const [lo, hi] = POLL_RANGES[id];
      const a = pctForListSeats(id, lo), b = pctForListSeats(id, hi);
      expect(a, `${id} ${lo}`).not.toBeNull();
      expect(b, `${id} ${hi}`).not.toBeNull();
      expect(b!).toBeGreaterThanOrEqual(a!);
    }
  });
  it("רשימה גדולה: האחוז קרוב לממוצע הסקרים", () => {
    expect(Math.abs(pctForListSeats("likud", 23)! - POLL_SHARES.likud)).toBeLessThan(1.5);
  });
});
