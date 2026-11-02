import { describe, expect, it } from "vitest";
import { SCREENS, navScreens, screen, screenTabs } from "./pages";

describe("קטלוג הניווט האחד", () => {
  it("שלושת מסכי הבחירות בסדר הקבוע, בכל מצב (הכרעות בעלים 02.11.2026)", () => {
    expect(navScreens(false, 0).map(s => s.label)).toEqual(["תוצאות", "מה השתנה", "סקרים"]);
    expect(navScreens(true, 0)).toEqual(navScreens(false, 0));
    expect(navScreens(false, Date.parse("2026-10-27T21:59:00+02:00")).map(s => s.id)).toEqual(["results", "changes", "polls"]);
    expect(screen("method").nav).toBe("foot");
  });
  it("הניחושים אינם באזור הבחירות", () => {
    expect(SCREENS.some(s => ["/guess", "/community", "/results-2026"].includes(s.to))).toBe(false);
  });
  it("כתובת ומזהה ייחודיים לכל מסך, ולשוניות ייחודיות במסך", () => {
    expect(new Set(SCREENS.map(s => s.to)).size).toBe(SCREENS.length);
    expect(new Set(SCREENS.map(s => s.id)).size).toBe(SCREENS.length);
    for (const s of SCREENS) expect(new Set((s.tabs ?? []).map(t => t.id)).size).toBe((s.tabs ?? []).length);
  });
  it("לשונית מתקדמת מוסתרת בממוקדת", () => {
    const s = { ...screen("results"), tabs: [{ id: "a", label: "א" }, { id: "b", label: "ב", advanced: true }] };
    expect(screenTabs(s, false).map(t => t.id)).toEqual(["a"]);
    expect(screenTabs(s, true).map(t => t.id)).toEqual(["a", "b"]);
  });
});
