import { describe, expect, it } from "vitest";
import { timeLeftText, wallClockLeft } from "./countdown";

const H = 3_600_000, D = 24 * H;
describe("timeLeftText", () => {
  it("ימים ושעות", () => expect(timeLeftText(16 * D + 21 * H + 5)).toBe("16 ימים ו-21 שעות"));
  it("יום ושעה בלשון יחיד", () => expect(timeLeftText(D + H)).toBe("יום אחד ו-שעה אחת"));
  it("רק שעות", () => expect(timeLeftText(5 * H)).toBe("5 שעות"));
  it("פחות משעה", () => expect(timeLeftText(10 * 60_000)).toBe("פחות משעה"));
  it("עבר הזמן", () => expect(timeLeftText(0)).toBe(""));
});

describe("wallClockLeft", () => {
  const target = Date.parse("2026-10-27T22:00:00+02:00");
  it("לפני מעבר לשעון חורף: שעה פחות מהזמן האמיתי", () => {
    const now = Date.parse("2026-10-12T14:00:00+03:00");
    expect(wallClockLeft(target, now)).toBe(15 * 86_400_000 + 8 * 3_600_000);
  });
  it("אחרי המעבר: הזמן האמיתי", () => {
    const now = Date.parse("2026-10-26T20:00:00+02:00");
    expect(wallClockLeft(target, now)).toBe(26 * 3_600_000);
  });
});
