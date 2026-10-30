import { describe, expect, it } from "vitest";
import type { SeatsPayload, Version } from "./crowdApi";
import { guessLabel, guessRows, guessScore, numberGuesses } from "./guessHistory";

const version = (id: number, seats: Record<string, number>): Version => ({
  id,
  unit: "seats",
  created_at: `2026-10-${10 + id}T10:00:00Z`,
  payload: { seats: Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, { v, src: "manual", locked: false }])), start: "zero", pollsAsOf: null } as SeatsPayload,
});

describe("guessHistory", () => {
  it("מספור לפי סדר השמירה, מהחדש לישן, בכל סדר שהשרת מחזיר", () => {
    const out = numberGuesses([version(30, { a: 1 }), version(10, { a: 2 }), version(20, { a: 3 })]);
    expect(out.map((g) => [g.version.id, g.n, g.total])).toEqual([[30, 3, 3], [20, 2, 3], [10, 1, 3]]);
    expect(out[0].values).toEqual({ a: 1 });
    expect(guessLabel(3, 5)).toBe("ניחוש 3/5");
  });

  it("דיוק: מנדטים במקום הנכון ומפלגות מדויקות", () => {
    const actual = { a: 60, b: 40, c: 20, d: 0 };
    expect(guessScore({ a: 60, b: 40, c: 20, d: 0 }, actual)).toEqual({ seats: 120, lists: 3, passed: 3 });
    // 10 מנדטים הועברו מ-b ל-a: 10 מנדטים במקום הלא נכון
    expect(guessScore({ a: 70, b: 30, c: 20 }, actual)).toEqual({ seats: 110, lists: 1, passed: 3 });
  });

  it("שורות: רשימות שעברו או שקיבלו ניחוש, לפי האמת", () => {
    const rows = guessRows({ a: 30, b: 0, c: 5, d: 4 }, { a: 28, b: 10, c: 5, d: 0 });
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(rows.map((r) => r.exact)).toEqual([false, false, true, false]);
  });

  it("בלי תוצאות אמת: רק מה שנוחש, בלי סימון מדויק", () => {
    const rows = guessRows({ a: 30, b: 0, c: 5 }, null);
    expect(rows).toEqual([{ id: "a", guess: 30, actual: 0, exact: false }, { id: "c", guess: 5, actual: 0, exact: false }]);
  });
});
