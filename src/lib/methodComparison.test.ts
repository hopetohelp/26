import { expect, it } from "vitest";
import { compareMethods } from "./methodComparison";
import type { Cycle } from "./history";
it("השוואת שיטות משתמשת באותו ספק ובסקרים שהיו זמינים בלבד", () => {
  const cycle: Cycle = { id: "k25", date: "2022-11-01", label: "2022", knesset: 25, recommendedNetanyahu: [], source: { page: "מקור", sha256: "s", tableLine: 1 }, polls: [
    { id: "old", firmKey: "a", firmHe: "א", publisherHe: null, start: "2022-10-20", end: "2022-10-20", values: { a: { s: 60 }, b: { s: 60 } }, consistent: true, seatSum: 120, urls: [] },
    { id: "future", firmKey: "b", firmHe: "ב", publisherHe: null, start: "2022-10-25", end: "2022-10-25", values: { a: { s: 100 }, b: { s: 20 } }, consistent: true, seatSum: 120, urls: [] },
  ] };
  const result = { id: "k25", date: cycle.date, label: "2022", knesset: 25, valid: 1000, lists: [{ letters: "a", name: "א", short: "א", seats: 60, votes: 500 }, { letters: "b", name: "ב", short: "ב", seats: 60, votes: 500 }] };
  const [row] = compareMethods([cycle], [result], [{ cycle: "k25", asof: "2022-10-21", horizon: 11, lists: { a: { central: 60 }, b: { central: 60 } } }]);
  expect(row.inputRefs).toEqual(["old"]);
  expect(row.latestFieldworkEnd).toBe("2022-10-20");
  expect(row.products["polls.mean"].seats).toEqual({ a: 60, b: 60 });
  expect(row.products["polls.mean"].meanAbsoluteSeatError).toBe(0);
});
