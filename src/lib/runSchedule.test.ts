import { describe, expect, it } from "vitest";
import { isRunSlot, isShabbatWindow, nextRun } from "./runSchedule";

// 12.10.2026 = יום שני, שעון קיץ (UTC+3); 28.10.2026 = יום רביעי, שעון חורף (UTC+2)
const at = (iso: string) => Date.parse(iso);

describe("לוח הריצות", () => {
  it("הריצה הבאה היא ב-02:03 שעון ישראל ביום זוגי — בקיץ", () => {
    expect(new Date(nextRun(at("2026-10-11T22:00:00Z"))!).toISOString()).toBe("2026-10-11T23:03:00.000Z"); // 12.10 02:03 בישראל
  });
  it("וגם בחורף (ההפרש לשעון ישראל משתנה, הלוח לא)", () => {
    expect(new Date(nextRun(at("2026-11-18T10:00:00Z"))!).toISOString()).toBe("2026-11-19T00:03:00.000Z"); // 19.11 02:03 בישראל
  });
  it("אחרי ריצה — הבאה אחרי יומיים", () => {
    expect(new Date(nextRun(at("2026-10-11T23:03:00Z"))!).toISOString()).toBe("2026-10-13T23:03:00.000Z"); // 14.10 02:03
  });
  it("שבת מושבתת: שישי 16:00 עד מוצאי שבת 20:00", () => {
    expect(isShabbatWindow(at("2026-10-16T12:59:00Z"))).toBe(false); // שישי 15:59
    expect(isShabbatWindow(at("2026-10-16T13:00:00Z"))).toBe(true); // שישי 16:00
    expect(isShabbatWindow(at("2026-10-17T16:59:00Z"))).toBe(true); // שבת 19:59
    expect(isShabbatWindow(at("2026-10-17T17:00:00Z"))).toBe(false); // שבת 20:00
  });
  it("ריצה שנופלת בשבת מדולגת, והבאה אחריה ביום שני", () => {
    expect(new Date(nextRun(at("2026-11-19T00:03:00Z"))!).toISOString()).toBe("2026-11-23T00:03:00.000Z"); // 21.11 (שבת) מדולג; 23.11 02:03
  });
  it("רגע שאינו שעת ריצה אינו ריצה", () => {
    expect(isRunSlot(at("2026-10-11T23:04:00Z"))).toBe(false); // 02:04
    expect(isRunSlot(at("2026-10-12T03:03:00Z"))).toBe(false); // 06:03
    expect(isRunSlot(at("2026-10-12T23:03:00Z"))).toBe(false); // 13.10 — יום אי-זוגי
    expect(isRunSlot(at("2026-10-11T23:03:00Z"))).toBe(true); // 12.10 02:03
  });
});
