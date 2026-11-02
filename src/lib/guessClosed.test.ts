import { describe, expect, it } from "vitest";
import { GUESS_CLOSE_AT, guessClosed } from "./guessClosed";
import { guessAreaTabs, navScreens } from "./pages";

describe("guess screen closes at 21:58 Israel time on election day", () => {
  it("open one minute before, closed at the minute", () => {
    expect(GUESS_CLOSE_AT).toBe(Date.UTC(2026, 9, 27, 19, 58));
    expect(guessClosed(GUESS_CLOSE_AT - 60_000)).toBe(false);
    expect(guessClosed(GUESS_CLOSE_AT)).toBe(true);
  });
  it("the nav hides the guess screen after closing", () => {
    // "הניחוש שלי" באזור הניחושים (הכרעות בעלים 02.11.2026)
    expect(guessAreaTabs(GUESS_CLOSE_AT - 1).some(t => t.to === "/guess")).toBe(true);
    expect(guessAreaTabs(GUESS_CLOSE_AT).some(t => t.to === "/guess")).toBe(false);
    expect(guessAreaTabs(GUESS_CLOSE_AT, true).some(t => t.to === "/guess")).toBe(true);
    // "דיוק הניחושים" ו"תוצאות" מוצגים תמיד
    expect(guessAreaTabs(GUESS_CLOSE_AT).some(t => t.to === "/results-2026")).toBe(true);
    expect(navScreens(false, GUESS_CLOSE_AT).some(s => s.id === "results")).toBe(true);
  });
});
