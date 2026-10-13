import { describe, expect, it } from "vitest";
import { LONG_SHARE_TEXT, groupShareText, loadLogo, roundTo120 } from "./communityShare";

describe("roundTo120", () => {
  it("ממוצעים שבריים ⇐ חלוקה שלמה של 120 בדיוק", () => {
    const out = roundTo120({ a: 30.4, b: 25.6, c: 20.5, d: 43.5 });
    expect(Object.values(out).reduce((x, y) => x + y, 0)).toBe(120);
    expect(out.b).toBe(26);
  });
  it("בלי נתונים ⇐ ריק", () => expect(roundTo120({})).toEqual({}));
});

describe("שיתוף קבוצה", () => {
  it("הנוסח הארוך נחתם בקישור לאתר, פעם אחת בלבד", () => {
    expect(LONG_SHARE_TEXT.startsWith("לאחרונה נחשפתי לאתר בשם „בחירות 2026”")).toBe(true);
    expect(LONG_SHARE_TEXT.endsWith("הנה הקישור:\nhttps://26.hopetohelp.net")).toBe(true);
    expect(LONG_SHARE_TEXT.match(/https?:\/\//g)).toHaveLength(1);
  });
  it("המשפט מזכיר את שם הקבוצה", () => expect(groupShareText("הגזרה")).toContain("הגזרה"));
  it("בלי כתובת לתמונה — אין לוגו, ולא נכשל", async () => expect(await loadLogo(null)).toBeNull());
  it("כתובת שנכשלת — אין לוגו, ולא נכשל", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
    try { expect(await loadLogo("https://x.example/logo.png")).toBeNull(); } finally { globalThis.fetch = real; }
  });
});
