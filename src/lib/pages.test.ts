import { describe, expect, it } from "vitest";
import { SCREENS, navScreens, screen, screenTabs } from "./pages";

describe("קטלוג הניווט האחד", () => {
  it("שלושת מסכי הליבה בסדר הקבוע, בכל מצב", () => {
    expect(navScreens(false).map(s => s.label)).toEqual(["תמונת מצב", "הניחוש שלי", "ממוצע הניחושים"]);
    expect(navScreens(true).slice(0, 3)).toEqual(navScreens(false));
  });
  it("במתקדם נוסף ״עוד ← בחירות קודמות״; ״מידע ומקורות״ אינו בסרגל אבל זמין תמיד", () => {
    expect(navScreens(true).map(s => s.id)).toEqual(["home", "guess", "community", "polls", "past"]);
    expect(navScreens(true).filter(s => s.nav === "more").every(s => s.advanced)).toBe(true);
    expect(screen("method").nav).toBe("foot");
    expect(screen("method").advanced).toBeFalsy();
  });
  it("כתובת ומזהה ייחודיים לכל מסך, ולשוניות ייחודיות במסך", () => {
    expect(new Set(SCREENS.map(s => s.to)).size).toBe(SCREENS.length);
    expect(new Set(SCREENS.map(s => s.id)).size).toBe(SCREENS.length);
    for (const s of SCREENS) expect(new Set((s.tabs ?? []).map(t => t.id)).size).toBe((s.tabs ?? []).length);
  });
  it("לשונית מתקדמת מוסתרת בממוקדת", () => {
    const s = { ...screen("home"), tabs: [{ id: "a", label: "א" }, { id: "b", label: "ב", advanced: true }] };
    expect(screenTabs(s, false).map(t => t.id)).toEqual(["a"]);
    expect(screenTabs(s, true).map(t => t.id)).toEqual(["a", "b"]);
  });
});
