import { describe, expect, it } from "vitest";
import { accuracyPct, accuracyRows, accuracyTable, bestCombination, biggestGap, distance, shareFarther, shareFartherHist } from "./guessAccuracy";

describe("guessAccuracy", () => {
  it("מרחק במנדטים ובאחוזים; רשימה שלא עברה מול 4", () => {
    expect(distance(12, 10)).toEqual({ seats: 2, pct: 20 });
    expect(distance(4, 0)).toEqual({ seats: 4, pct: 100 });
  });
  it("רחוקים יותר — שוויון חצי", () => {
    expect(shareFarther(2, [1, 2, 3, 4])).toBe(0.625);
    expect(shareFarther(2, [])).toBeNull();
    // hist: 2 ניחשו 10, 1 ניחש 12, 1 ניחש 15; אמת 10, ניחוש 12 ⇐ מרחק 2
    const h = Array(121).fill(0); h[10] = 2; h[12] = 1; h[15] = 1;
    expect(shareFartherHist(2, h, 10)).toBe(0.375);
  });
  it("טבלה: טורים ושקלול שווה", () => {
    const actual = { a: 10, b: 5 }, ids = ["a", "b"];
    const h = { a: Array(121).fill(0), b: Array(121).fill(0) };
    h.a[10] = 1; h.a[14] = 1; h.b[5] = 1; h.b[9] = 1;
    const polls = [{ a: 11, b: 5 }, { a: 13, b: 8 }];
    const t = accuracyTable({ subject: { a: 12, b: 5 }, actual, ids, hist: h, polls });
    expect(t.rows[0]).toMatchObject({ seats: 2, pct: 20, vsCrowd: 0.5, pollsCloser: 0.5 });
    expect(t.rows[1]).toMatchObject({ seats: 0, vsCrowd: 0.75, pollsCloser: 0 });
    expect(t.total.score).toBeCloseTo((0.5 + 0.5) / 2 / 2 + (0.75 + 0.75) / 2 / 2);
  });
  it("סקר כנושא — לא מושווה לעצמו", () => {
    const t = accuracyTable({ subject: { a: 11 }, actual: { a: 10 }, ids: ["a"], hist: null, polls: [{ a: 11 }, { a: 13 }], exclude: 0 });
    expect(t.rows[0].pollsCloser).toBe(0);
    expect(t.rows[0].vsCrowd).toBeNull();
    expect(t.rows[0].score).toBe(1);
  });
  it("שורות, אחוז דיוק, צירוף ופער", () => {
    expect(accuracyRows({ a: 10, c: 0 }, { b: 3, c: 1 })).toEqual(["a", "b"]);
    expect(accuracyPct({ a: 62, b: 58 }, { a: 60, b: 60 })).toBeCloseTo(100 * (1 - 2 / 120));
    const best = bestCombination([{ key: "x", values: { a: 12 } }, { key: "y", values: { a: 8 } }, { key: "z", values: { a: 20 } }], { a: 10 }, ["a"]);
    expect(best?.keys).toEqual(["x", "y"]);
    expect(biggestGap({ a: 12, b: 2 }, { a: 10, b: 6 }, ["a", "b"])).toEqual({ id: "b", gap: -4 });
  });
});

import results2026 from "../../raw/results-2026.json";
describe("raw/results-2026.json", () => {
  it("כל רשימה: 0 או לפחות 4 מנדטים (אין 1–3), וסך 120 כשיש תוצאות", () => {
    const seats = Object.values(results2026.seats as Record<string, number>);
    for (const s of seats) expect(s === 0 || (Number.isInteger(s) && s >= 4)).toBe(true);
    if (results2026.status !== "none") expect(seats.reduce((a, b) => a + b, 0)).toBe(120);
  });
});
