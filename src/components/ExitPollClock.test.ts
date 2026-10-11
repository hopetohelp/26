import { describe, expect, it } from "vitest";
import { clockParts } from "./ExitPollClock";

const MIN = 60_000, H = 60 * MIN, D = 24 * H;
describe("clockParts", () => {
  it("ימים, שעות ודקות", () => expect(clockParts(16 * D + 8 * H + 12 * MIN + 59_000)).toEqual({ days: 16, hours: 8, minutes: 12, seconds: 59 }));
  it("פחות משעה", () => expect(clockParts(5 * MIN)).toEqual({ days: 0, hours: 0, minutes: 5, seconds: 0 }));
  it("פחות מדקה — שניות", () => expect(clockParts(30_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 30 }));
  it("עבר הזמן", () => { expect(clockParts(0)).toBeNull(); expect(clockParts(-5)).toBeNull(); });
});
