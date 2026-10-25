import { describe, expect, it, beforeEach } from "vitest";
import { getGroups, setGroups } from "./crowdSession";

// חברות בגזרה נשמרת במכשיר מהפעם הראשונה (הכרעת בעלים 25.10.2026) — בלי בדיקה מחדש בכל טעינה
describe("שמירת החברות בקבוצות במכשיר", () => {
  beforeEach(() => setGroups(null));
  it("נשמרת ונקראת שוב; ניקוי מוחק", () => {
    expect(getGroups()).toBeNull();
    setGroups([{ id: "gy7lelpbo", name: "הגזרה", slug: "hagzara", image: null }]);
    expect(getGroups()?.map(g => g.id)).toEqual(["gy7lelpbo"]);
    setGroups(null);
    expect(getGroups()).toBeNull();
  });
  it("ערך פגום אינו נחשב חברות", () => {
    setGroups([{ nope: 1 } as unknown as { id: string }]);
    expect(getGroups()).toEqual([]);
  });
});
