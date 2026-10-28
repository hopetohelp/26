import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// בודקים את הסקריפט האמיתי שרץ לפני ציור העמוד, לרבות דפדפן שחוסם אחסון ב-iframe.
const bootstrap = readFileSync("index.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)![1];

function startsDark(hash: string, saved: string | null, deviceDark: boolean, blocked = false) {
  const dataset: Record<string, string> = {};
  runInNewContext(bootstrap, {
    URLSearchParams,
    location: { hash },
    document: { documentElement: { dataset } },
    localStorage: { getItem: () => { if (blocked) throw new Error("אחסון חסום"); return saved; } },
    matchMedia: () => ({ matches: deviceDark }),
  });
  return "dark" in dataset;
}

describe("תצורת ההטמעה לפני ציור ראשון", () => {
  for (const path of ["#/results-2026?", "#/past?tab=changes&"]) {
    it(`${path} ברירת מחדל בהירה גם למשתמש ולמכשיר במצב לילה`, () => {
      for (const suffix of ["", "&theme=light", "&theme=invalid"]) {
        expect(startsDark(`${path}embed=1${suffix}`, "dark", true)).toBe(false);
      }
    });
    it(`${path} לפי המשתמש מכבד בחירה שמורה ואז את המכשיר`, () => {
      const hash = `${path}embed=1&theme=auto`;
      expect(startsDark(hash, "dark", false)).toBe(true);
      expect(startsDark(hash, "light", true)).toBe(false);
      for (const saved of [null, "auto", "invalid"]) {
        expect(startsDark(hash, saved, true)).toBe(true);
        expect(startsDark(hash, saved, false)).toBe(false);
      }
    });
    it(`${path} אחסון חסום אינו משבש תצורה מפורשת או זיהוי מכשיר`, () => {
      expect(startsDark(`${path}embed=1`, null, true, true)).toBe(false);
      expect(startsDark(`${path}embed=1&theme=dark`, null, false, true)).toBe(true);
      expect(startsDark(`${path}embed=1&theme=auto`, null, true, true)).toBe(true);
    });
  }
  it("קישור רגיל משתמש בהעדפת האתר ומתעלם מפרמטר הצבע", () => {
    expect(startsDark("#/results-2026?theme=light", "dark", false)).toBe(true);
    expect(startsDark("#/past?tab=changes&theme=dark", "light", true)).toBe(false);
  });
});
