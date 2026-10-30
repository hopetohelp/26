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
  for (const path of ["#/results-2026?", "#/past?tab=changes&", "#/flow-graphs?"]) {
    it(`${path} תמיד לפי העדפת המכשיר, ואם אין — בהיר`, () => {
      // גם בחירה שמורה באתר וגם פרמטר theme בכתובות ישנות — מתעלמים מהם
      for (const suffix of ["", "&theme=light", "&theme=dark", "&theme=auto", "&theme=invalid"]) {
        for (const saved of [null, "light", "dark", "auto", "invalid"]) {
          expect(startsDark(`${path}embed=1${suffix}`, saved, true)).toBe(true);
          expect(startsDark(`${path}embed=1${suffix}`, saved, false)).toBe(false);
        }
      }
    });
    it(`${path} אחסון חסום אינו משבש את זיהוי המכשיר`, () => {
      expect(startsDark(`${path}embed=1`, null, true, true)).toBe(true);
      expect(startsDark(`${path}embed=1`, null, false, true)).toBe(false);
    });
  }
  it("קישור רגיל משתמש בהעדפת האתר ומתעלם מפרמטר הצבע", () => {
    expect(startsDark("#/results-2026?theme=light", "dark", false)).toBe(true);
    expect(startsDark("#/past?tab=changes&theme=dark", "light", true)).toBe(false);
  });
});
