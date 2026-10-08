import { describe, expect, it } from "vitest";
import { decodeBackup, encodeBackup } from "./backup";
import { IDS } from "./model";

const seats = { mode: "seats" as const, start: "zero" as const, pollsAsOf: null, seats: Object.fromEntries(IDS.map((id, i) => [id, { v: i === 0 ? 120 : 0, src: "manual" as const, locked: true }])) };

describe("גיבוי במכשיר", () => {
  it("הלוך ושוב, גם עם עברית", () => {
    const code = encodeBackup({ seats, vote: { v2022: null, v2026: "undecided" } });
    expect(code.startsWith("E26:")).toBe(true);
    expect(decodeBackup(code)).toEqual({ seats, vote: { v2022: null, v2026: "undecided" } });
    expect(decodeBackup("  " + code.slice(0, 20) + "\n" + code.slice(20) + " ")).not.toBeNull();
  });
  it("קוד פגום, ריק או עם נתון לא תקין נדחה", () => {
    expect(decodeBackup("")).toBeNull();
    expect(decodeBackup("E26:@@@")).toBeNull();
    expect(decodeBackup("hello")).toBeNull();
    const bad = { ...seats, seats: { ...seats.seats, [IDS[0]]: { v: 500, src: "manual", locked: true } } };
    expect(decodeBackup(encodeBackup({ seats: bad as never }))).toBeNull();
  });
});
