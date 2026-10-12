import { describe, expect, it } from "vitest";
import { isRunSlot, isShabbatWindow, nextRun } from "./runSchedule";

// 12.10.2026 = יום שני, שעון קיץ (UTC+3); 28.10.2026 = יום רביעי, שעון חורף (UTC+2)
const at = (iso: string) => Date.parse(iso);

describe("לוח הריצות", () => {
  it("הריצה הבאה היא בשעת ריצה בדקה 3 שעון ישראל — בקיץ", () => {
    expect(new Date(nextRun(at("2026-10-12T10:00:00Z"))!).toISOString()).toBe("2026-10-12T11:03:00.000Z"); // 14:03 בישראל
  });
  it("וגם בחורף (ההפרש לשעון ישראל משתנה, הלוח לא)", () => {
    expect(new Date(nextRun(at("2026-10-28T10:00:00Z"))!).toISOString()).toBe("2026-10-28T12:03:00.000Z"); // 14:03 בישראל
  });
  it("אחרי ריצה — הבאה אחרי ארבע שעות", () => {
    expect(new Date(nextRun(at("2026-10-12T11:03:00Z"))!).toISOString()).toBe("2026-10-12T15:03:00.000Z");
  });
  it("שבת מושבתת: שישי 16:00 עד מוצאי שבת 20:00", () => {
    expect(isShabbatWindow(at("2026-10-16T12:59:00Z"))).toBe(false); // שישי 15:59
    expect(isShabbatWindow(at("2026-10-16T13:00:00Z"))).toBe(true); // שישי 16:00
    expect(isShabbatWindow(at("2026-10-17T16:59:00Z"))).toBe(true); // שבת 19:59
    expect(isShabbatWindow(at("2026-10-17T17:00:00Z"))).toBe(false); // שבת 20:00
  });
  it("אחרי שישי 14:03 הריצה הבאה היא רק במוצאי שבת ב-22:03", () => {
    expect(new Date(nextRun(at("2026-10-16T10:30:00Z"))!).toISOString()).toBe("2026-10-16T11:03:00.000Z"); // שישי 14:03
    expect(new Date(nextRun(at("2026-10-16T11:04:00Z"))!).toISOString()).toBe("2026-10-17T19:03:00.000Z"); // שבת 22:03
  });
  it("רגע שאינו שעת ריצה אינו ריצה", () => {
    expect(isRunSlot(at("2026-10-12T11:04:00Z"))).toBe(false);
    expect(isRunSlot(at("2026-10-12T12:03:00Z"))).toBe(false); // 15:03
    expect(isRunSlot(at("2026-10-12T11:03:00Z"))).toBe(true); // 14:03
  });
});
