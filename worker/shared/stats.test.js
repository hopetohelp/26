import { describe, it, expect } from "vitest";
import { STATS_FROM, HOUR_MS, cumulative, israelMidnight, mergeDailyHourly, series, statsBuckets } from "./stats.js";

describe("stats series", () => {
  it("cumulative counts every event before the end of each hour, including events before the first point", () => {
    const now = STATS_FROM + 2 * HOUR_MS + 10;
    const b = statsBuckets(now);
    expect(b).toEqual([STATS_FROM, STATS_FROM + HOUR_MS, STATS_FROM + 2 * HOUR_MS]);
    expect(cumulative([[STATS_FROM - 5, 3], [STATS_FROM + 1, 1], [STATS_FROM + HOUR_MS + 1, 2], [NaN, 9]], b, now)).toEqual([4, 6, 6]);
  });
  it("today starts at midnight Israel time (winter: UTC+2)", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(israelMidnight(now)).toBe(Date.parse("2026-10-27T22:00:00Z"));
    const s = series("x", [[Date.parse("2026-10-27T21:59:00Z"), 1], [Date.parse("2026-10-27T22:01:00Z"), 1]], statsBuckets(now), now);
    expect(s.total).toBe(2);
    expect(s.today).toBe(1);
    expect(s.points.at(-1)).toBe(2);
  });
  it("a daily counter is not double counted with its hourly counter", () => {
    const ev = mergeDailyHourly([["2026-10-28", 10], ["2026-10-27", 4]], [["2026-10-28T09", 3], ["2026-10-28T10", 2]]);
    expect(ev.reduce((a, [, w]) => a + w, 0)).toBe(14);
    expect(ev).toContainEqual([Date.parse("2026-10-28T00:00:00Z"), 5]);
  });
});
