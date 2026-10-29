import { describe, expect, it } from "vitest";
import { SCREENS, navScreens, screen, screenTabs } from "./pages";

describe("קטלוג הניווט האחד", () => {
  it("מסכי הליבה בסדר הקבוע, בכל מצב", () => {
    // "מה השתנה" מסך עצמאי בשתי התצוגות (הכרעת בעלים 29.10.2026)
    expect(navScreens(false, 0).map(s => s.label)).toEqual(["תוצאות אמת", "הניחוש שלי", "מה השתנה"]);
    expect(navScreens(true, 0).slice(0, 2)).toEqual(navScreens(false, 0).slice(0, 2));
  });
  it("במתקדם נוסף ״עוד ← היסטוריה״; ״מידע ומקורות״ אינו בסרגל אבל זמין תמיד", () => {
    expect(navScreens(true, 0).map(s => s.id)).toEqual(["results2026", "guess", "changes", "community", "polls", "past"]);
    expect(navScreens(false, Date.parse("2026-10-27T21:59:00+02:00")).map(s => s.id)).toEqual(["results2026", "changes"]);
    expect(navScreens(true, 0).filter(s => s.nav === "more").every(s => s.advanced)).toBe(true);
    expect(screen("method").nav).toBe("foot");
    expect(screen("method").advanced).toBeFalsy();
  });
  it("כתובת ומזהה ייחודיים לכל מסך, ולשוניות ייחודיות במסך", () => {
    expect(new Set(SCREENS.map(s => s.to)).size).toBe(SCREENS.length);
    expect(new Set(SCREENS.map(s => s.id)).size).toBe(SCREENS.length);
    for (const s of SCREENS) expect(new Set((s.tabs ?? []).map(t => t.id)).size).toBe((s.tabs ?? []).length);
  });
  it("לשונית מתקדמת מוסתרת בממוקדת", () => {
    const s = { ...screen("results2026"), tabs: [{ id: "a", label: "א" }, { id: "b", label: "ב", advanced: true }] };
    expect(screenTabs(s, false).map(t => t.id)).toEqual(["a"]);
    expect(screenTabs(s, true).map(t => t.id)).toEqual(["a", "b"]);
  });
});
