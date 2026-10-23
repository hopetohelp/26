import { describe, expect, it } from "vitest";
import { requiresAdvanced } from "./interfaceMode";
import { seatSaveError } from "./seatSaveGuard";
import { IDS, startSeats } from "../pages/guess/model";
import type { SeatsPayload } from "./crowdApi";
import { SIMPLE_14_24, SIMPLE_ALL, SIMPLE_FIRMS, simpleSelection, simpleValue } from "./simpleSources";
import { resolveData } from "./dataResolver";
const payload = (values: number[]): SeatsPayload => ({ ...startSeats("zero"), seats: Object.fromEntries(values.map((v, i) => [IDS[i], { v, locked: false, src: "manual" as const }])) });
describe("מצב פשוט ללא שינוי ביכולות מתקדמות", () => {
  it("קישורים לכלים מתקדמים נשמרים", () => {
    expect(requiresAdvanced("/guess", "?section=blocs")).toBe(true);
    expect(requiresAdvanced("/guess", "?g=shared")).toBe(true);
    expect(requiresAdvanced("/polls", "?tab=archive")).toBe(true);
    expect(requiresAdvanced("/guess", "?view=edit")).toBe(false);
    expect(requiresAdvanced("/community", "")).toBe(false);
    expect(requiresAdvanced("/g/hagzara", "")).toBe(false);
  });
  it("כל מסלול שמירה חוסם כנסת חלקית, עודפת או מפלגה לא תקינה", () => {
    for (const values of [[119], [121], [1, 119], [3, 117], [4.5, 115.5], [-1, 121], [NaN]]) expect(seatSaveError("seats", payload(values))).not.toBeNull();
    expect(seatSaveError("seats", payload([60, 60]))).toBeNull();
    expect(seatSaveError("seats", payload([120]))).toBeNull();
    expect(seatSaveError("seats", { ...payload([120]), mode: "pct" })).not.toBeNull();
    expect(seatSaveError("vote", { v2022: null, v2026: null })).toBeNull();
  });
  it("טורי הייחוס מגיעים מהספק, ומכון מופיע פעם אחת", () => {
    expect(new Set(SIMPLE_FIRMS.map(f => f.id)).size).toBe(SIMPLE_FIRMS.length);
    expect(simpleSelection("14-24")).toEqual(SIMPLE_14_24);
    expect(simpleValue(SIMPLE_ALL, [IDS[0]])).toBe(resolveData(SIMPLE_ALL, [IDS[0]], "community").value);
    expect(simpleSelection("unrecognized")).toEqual(SIMPLE_ALL);
  });
});
