import { describe, expect, it } from "vitest";
import type { SeatsPayload } from "../../lib/crowdApi";
import { canViewCommunity } from "./stage";

const ids = ["a", "b", "c"];
const guess = (...values: number[]): SeatsPayload => ({ start: "zero", pollsAsOf: null, seats: Object.fromEntries(values.map((v, i) => [ids[i], { v, src: "manual", locked: true }])) });

describe("המעבר מהשערה לממוצע המשתתפים", () => {
  it("חסום ללא השערה, לפני השלמה ובחריגה", () => {
    for (const p of [null, undefined, guess(0, 0, 0), guess(60, 59, 0), guess(60, 61, 0)]) expect(canViewCommunity(p, ids)).toBe(false);
  });
  it("120 אינו מספיק אם יש מנדטים לא חוקיים או רשימה לא מוכרת", () => {
    expect(canViewCommunity(guess(117, 3, 0), ids)).toBe(false);
    expect(canViewCommunity(guess(60.5, 59.5, 0), ids)).toBe(false);
    expect(canViewCommunity(guess(60, 60, 0), ["a", "b"])).toBe(false);
  });
  it("נפתח לחלוקה תקינה, גם לפני שמירה בחשבון וללא תלות בנעילות", () => {
    const p = guess(60, 60, 0);
    p.seats.a.locked = false;
    expect(canViewCommunity(p, ids)).toBe(true);
  });
  it("השערת אחוזים מחייבת גם קלט אחוזים תקין", () => {
    const p = { ...guess(60, 60, 0), mode: "pct" as const };
    expect(canViewCommunity(p, ids)).toBe(false);
    expect(canViewCommunity({ ...p, pct: { a: 51, b: 51 } }, ids)).toBe(false);
    expect(canViewCommunity({ ...p, pct: { a: 50, b: 50 } }, ids)).toBe(true);
  });
});
