import { describe, expect, it } from "vitest";
import type { SeatCell, SeatsPayload } from "../../lib/crowdApi";
import { validateSeats } from "../../lib/crowdValidate";
import { canSetSeats } from "./seatEditing";

const cell = (v: number, locked = true): SeatCell => ({ v, src: "manual", locked });
const ids = ["a", "b", "c"];
describe("עריכה מעל 120", () => {
  it("מתיר חריגה אם תישאר מפלגה פתוחה אחרת, וחוסם כשכולן נעולות", () => {
    const seats = { a: cell(60), b: cell(60, false), c: cell(0) };
    expect(canSetSeats(seats, ids, "a", 61)).toBe(true);
    expect(canSetSeats({ ...seats, b: cell(60) }, ids, "a", 61)).toBe(false);
    // עריכת המפלגה הפתוחה האחרונה נועלת אותה, ולכן לא מאפשרת חריגה.
    expect(canSetSeats(seats, ids, "b", 61)).toBe(false);
  });
  it("מאפשר להגיע ל־120 בלי פתוחות ולהפחית גם כשכבר חורגים", () => {
    expect(canSetSeats({ a: cell(60), b: cell(59), c: cell(0) }, ids, "a", 61)).toBe(true);
    expect(canSetSeats({ a: cell(80), b: cell(60), c: cell(0) }, ids, "a", 79)).toBe(true);
    expect(canSetSeats({ a: cell(80), b: cell(60), c: cell(0) }, ids, "a", 81)).toBe(false);
  });
  it("מפלגה חסרה נחשבת פתוחה; החסימה מתעדכנת גם כשכבר מעל 120", () => {
    expect(canSetSeats({ a: cell(80), b: cell(60) }, ids, "a", 81)).toBe(true);
    expect(canSetSeats({ a: cell(80), b: cell(60, false), c: cell(0) }, ids, "a", 81)).toBe(true);
  });
});

describe("חסימת שמירה מתחת לסף", () => {
  const payload = (v: number, mode: SeatsPayload["mode"] = "seats"): SeatsPayload => ({
    seats: { a: cell(120 - v), b: cell(v), c: cell(0) }, start: "zero", pollsAsOf: null, mode,
    ...(mode === "pct" ? { pct: { a: 97, b: 3 } } : {}),
  });
  it.each([1, 2, 3])("דוחה %i מנדטים גם בסכום תקין ובערכים שהושלמו", v => {
    const p = payload(v);
    p.seats.b = { v, src: "filled", locked: false };
    expect(validateSeats(p, ids)).toMatch(/אי אפשר לשמור/);
    expect(validateSeats(payload(v, "pct"), ids)).toMatch(/אי אפשר לשמור/);
  });
  it.each([0, 4])("מקבל %i מנדטים; אחוזים מתחת לסף עם אפס מנדטים מותרים", v => {
    expect(validateSeats(payload(v), ids)).toBeNull();
    expect(validateSeats(payload(0, "pct"), ids)).toBeNull();
  });
});
