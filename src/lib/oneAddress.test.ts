import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * כתובת אחת לכל מסך (הכרעת בעלים 03.11.2026): אף כפתור, קישור או טקסט שיתוף באתר אינו מפנה לכתובת ישנה
 * שמעבירה הלאה. הכתובות הישנות נשארות בנתב רק בשביל קישורים שכבר הופצו.
 */
const OLD = ["community", "results-2026", "score", "past", "today", "forecast", "trends", "accuracy", "voters", "about", "support", "feedback", "calculator", "surveys/me", "surveys/manage"];
const LINK = new RegExp(`(?:to=\\{?["'\`]|navigate\\(["'\`]|#)/(?:${OLD.join("|")})(?=["'\`?#/\\s]|$)`, "g");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("כתובת אחת לכל מסך", () => {
  it("אין קישור פנימי לכתובת ישנה", () => {
    const found: string[] = [];
    for (const f of files("src")) {
      if (f.endsWith("main.tsx")) continue; // הנתב עצמו מגדיר את ההעברות
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$|^\s*\*.*$|\/\*.*?\*\//g, "");
        if (LINK.test(code) && !/feedback\/\$\{/.test(code)) found.push(`${f}:${i + 1}`);
        LINK.lastIndex = 0;
      });
    }
    expect(found).toEqual([]);
  });
});
