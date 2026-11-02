import { describe, expect, it } from "vitest";
import { allocate, type Agreement } from "../engine/baderOfer";
import { K26_RESULT } from "./election2026";
import { results2026 } from "./guessAccuracyData";

describe("2026 באותו מבנה של שאר המערכות (הכרעת בעלים 02.11.2026)", () => {
  it("מנוע החוק משחזר מהקולות ומהסכמי העודפים את המנדטים של 2026", () => {
    const votes = Object.fromEntries(K26_RESULT.lists.map((l) => [l.letters, l.votes]));
    const a = allocate(votes, K26_RESULT.valid, K26_RESULT.agreements.map(([x, y]) => [x, y] as Agreement));
    for (const l of K26_RESULT.lists) expect(a.seats[l.letters] ?? 0).toBe(results2026.seats[l.letters] ?? 0);
    expect(K26_RESULT.lists.reduce((t, l) => t + l.seats, 0)).toBe(120);
  });
  it("כשרים = הצביעו פחות פסולים; לכל רשימה אותיות פתק", () => {
    expect(K26_RESULT.voted - K26_RESULT.invalid).toBe(K26_RESULT.valid);
    expect(K26_RESULT.lists.every((l) => l.ballot)).toBe(true);
  });
});
