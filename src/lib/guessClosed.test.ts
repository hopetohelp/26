import { describe, expect, it } from "vitest";
import { GUESS_CLOSE_AT, guessClosed } from "./guessClosed";
import { navScreens } from "./pages";

describe("guess screen closes at 21:58 Israel time on election day", () => {
  it("open one minute before, closed at the minute", () => {
    expect(GUESS_CLOSE_AT).toBe(Date.UTC(2026, 9, 27, 19, 58));
    expect(guessClosed(GUESS_CLOSE_AT - 60_000)).toBe(false);
    expect(guessClosed(GUESS_CLOSE_AT)).toBe(true);
  });
  it("the nav hides the guess screen after closing", () => {
    expect(navScreens(false, GUESS_CLOSE_AT - 1).some(s => s.id === "guess")).toBe(true);
    expect(navScreens(false, GUESS_CLOSE_AT).some(s => s.id === "guess")).toBe(false);
  });
});
