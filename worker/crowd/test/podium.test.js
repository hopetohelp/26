import { describe, expect, it } from "vitest";
import { podium, setActualResults } from "../lib/results.js";

const value = (p, id) => p[id] ?? 0;
describe("פודיום הניחושים", () => {
  it("אחוז דיוק, אחר כך רשימות מדויקות, ובשוויון — מי ששמר קודם", () => {
    setActualResults({ a: 60, b: 40, c: 20 });
    const v = (payload, created_at) => ({ payload, created_at });
    const top = podium([
      v({ a: 58, b: 42, c: 20 }, "2026-10-27T10:00:00Z"), // 4 הפרשים (2 מנדטים במקום הלא נכון), רשימה אחת מדויקת
      v({ a: 60, b: 38, c: 22 }, "2026-10-27T09:00:00Z"), // 4 הפרשים (2 מנדטים במקום הלא נכון), רשימה אחת מדויקת, מוקדם
      v({ a: 60, b: 40, c: 20 }, "2026-10-27T12:00:00Z"),
      v({ a: 50, b: 50, c: 20 }, "2026-10-26T00:00:00Z"),
    ], value);
    expect(top).toEqual([
      { acc: 100, exact: 3, savedAt: "2026-10-27T12:00:00Z" },
      { acc: 98.3, exact: 1, savedAt: "2026-10-27T09:00:00Z" },
      { acc: 98.3, exact: 1, savedAt: "2026-10-27T10:00:00Z" },
    ]);
  });
  it("בלי תוצאות שלמות — אין פודיום", () => {
    setActualResults({ a: 3 });
    expect(podium([], value)).toBeUndefined();
  });
});
