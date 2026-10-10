import { describe, expect, it } from "vitest";
import { timeLeftText } from "./countdown";

const H = 3_600_000, D = 24 * H;
describe("timeLeftText", () => {
  it("ימים ושעות", () => expect(timeLeftText(16 * D + 21 * H + 5)).toBe("16 ימים ו-21 שעות"));
  it("יום ושעה בלשון יחיד", () => expect(timeLeftText(D + H)).toBe("יום אחד ו-שעה אחת"));
  it("רק שעות", () => expect(timeLeftText(5 * H)).toBe("5 שעות"));
  it("פחות משעה", () => expect(timeLeftText(10 * 60_000)).toBe("פחות משעה"));
  it("עבר הזמן", () => expect(timeLeftText(0)).toBe(""));
});
