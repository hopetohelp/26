import { describe, it, expect } from "vitest";
// @ts-expect-error — סקריפט JS של הבנייה
import { pollRanges } from "../../scripts/poll-ranges.mjs";
import pollsFile from "../data/polls.json";
import { LATEST_POLLS } from "./homeData";
import { POLL_AVERAGE } from "./sources";
import { lists2026, seatsIn } from "./data";

// הטווח שהשרת בודק מולו השערות חריגות = בדיוק הטווח שמוצג באתר (הנמוך והגבוה בין המכונים)
describe("poll ranges for moderation", () => {
  it("matches the site's per-pollster range", () => {
    const res = pollRanges((pollsFile as { polls: unknown[] }).polls, lists2026.map((l) => l.id), POLL_AVERAGE.asOf);
    expect(res.polls).toBe(LATEST_POLLS.length);
    for (const l of lists2026) {
      const xs = LATEST_POLLS.map((p) => seatsIn(p, l.id)).filter((x): x is number => typeof x === "number");
      if (!xs.length) { expect(res.ranges[l.id]).toBeUndefined(); continue; }
      expect(res.ranges[l.id]).toEqual({ lo: Math.min(...xs), hi: Math.max(...xs) });
    }
  });
});
