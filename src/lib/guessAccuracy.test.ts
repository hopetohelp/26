import { describe, expect, it } from "vitest";
import { accuracyPct, accuracyRows, closestPoll, pollAccuracyPct, bestCombination, biggestGap, closerShareHist, distance, histStats, pollStats } from "./guessAccuracy";

describe("guessAccuracy", () => {
  it("מרחק במנדטים ובאחוזים; רשימה שלא עברה מול 4", () => {
    expect(distance(12, 10)).toEqual({ seats: 2, pct: 20 });
    expect(distance(4, 0)).toEqual({ seats: 4, pct: 100 });
  });
  it("מנחשים קרובים יותר ממני — רק ממש קרובים", () => {
    // 2 ניחשו 10, 1 ניחש 12, 1 ניחש 15; אמת 10, המרחק שלי 2
    const h = Array(121).fill(0); h[10] = 2; h[12] = 1; h[15] = 1;
    expect(closerShareHist(2, h, 10)).toBe(0.5);
    expect(closerShareHist(0, h, 10)).toBe(0);
  });
  it("כל הניחושים: פגיעה מדויקת, מרחק ממוצע וחציון", () => {
    const h = Array(121).fill(0); h[10] = 2; h[12] = 1; h[15] = 1;
    expect(histStats(h, 10)).toEqual({ exact: 0.5, mean: 7 / 4, median: 11 });
    expect(histStats(Array(121).fill(0), 10)).toBeNull();
  });
  it("סקרים: סקר בלי נתון לרשימה אינו נכלל בה", () => {
    expect(pollStats([{ a: 10 }, { a: 13 }, {}], "a", 10)).toEqual({ exact: 0.5, mean: 1.5, n: 2 });
    expect(pollStats([{}], "a", 10)).toBeNull();
  });
  it("הסקר הקרוב ביותר — רשימה שלא פורסמה אינה טעות", () => {
    expect(pollAccuracyPct({ a: 60 }, { a: 60, b: 60 })).toBe(100);
    expect(closestPoll([{ k: "x", values: { a: 62, b: 58 } }, { k: "y", values: { a: 61, b: 59 } }], { a: 60, b: 60 })?.k).toBe("y");
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

import { turnoutPct } from "./guessAccuracyData";
import { registry } from "./data";
describe("turnoutPct — אחוז הצבעה מבעלי הזכות הרשמיים", () => {
  it("מצביעים מתוך הנתון הרשמי, ספרה אחת אחרי הנקודה", () => {
    expect(registry.k26.eligible).toBe(7336553);
    expect(turnoutPct(5449277, registry.k26.eligible)).toBe(74.3);
  });
  it("נתון לא תקין ⇐ null", () => {
    expect(turnoutPct(NaN, 7336553)).toBeNull();
    expect(turnoutPct(100, 0)).toBeNull();
  });
});
