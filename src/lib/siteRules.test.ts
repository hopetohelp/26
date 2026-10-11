import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * כללי האתר שנאכפים בקוד (הכרעת בעלים 11.10.2026): מקור אחד לממוצעים, תאריך אחד בכל מקום, ומקרא רק בתוך כפתור "מקרא".
 * הבדיקה סורקת את קוד המקור (בלי בדיקות) ונכשלת כשמישהו מוסיף קריאה ישירה שעוקפת את הכלל.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
const FILES = walk("src").map((path) => ({ path, text: readFileSync(path, "utf8") }));
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line);
const codeLines = (text: string) => text.split("\n").map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => !isComment(line));
const hits = (re: RegExp, except: string[] = []) =>
  FILES.filter((f) => !except.some((e) => f.path.endsWith(e))).flatMap((f) => codeLines(f.text).filter(({ line }) => re.test(line)).map(({ n }) => `${f.path}:${n}`));

describe("מקור אמת אחד לממוצעי הסקרים", () => {
  it("תאריך הממוצע, מספר הסקרים והמכונים נקראים רק מ-POLL_AVERAGE (src/lib/sources.ts)", () => {
    // הקוד שמחשב מהמודל (home.ts) אינו מציג "נכון ל"; כל השאר חייב לקרוא מ-sources.ts
    expect(hits(/\b(model|m|modelFile)\.(asof|polls|pollsters)\b/, ["lib/sources.ts"])).toEqual([]);
  });
  it("אין עוד פונקציית 'תאריך הסקר האחרון' שעלולה לסטות מהממוצע", () => {
    expect(hits(/lastPollDate/)).toEqual([]);
  });
  it("מסך שמציג ממוצע סקרים משתמש ב-POLL_AVERAGE", () => {
    const changes = FILES.find((f) => f.path.endsWith("pages/Changes.tsx"))!.text;
    expect(changes).toContain("POLL_AVERAGE.asOf");
    expect(changes).toContain("POLL_AVERAGE.shares");
    expect(changes).toContain("POLL_AVERAGE.seats");
  });
});

describe("תאריך אחד בכל האתר: יום/חודש (8/10)", () => {
  it("אין פורמט תאריך אחר (חודש במילים, he-IL מלא, נקודות) מחוץ ל-src/lib/format.ts", () => {
    expect(hits(/dateLong|toLocaleDateString|month:\s*"long"|dateStyle/)).toEqual([]);
    expect(hits(/\.toLocaleString\("he-IL",\s*\{[^}]*(day|month)/)).toEqual([]);
  });
  it("אין תאריך מלא בנקודות (8.10.2026) בטקסט שמוצג", () => {
    expect(hits(/\b\d{1,2}\.\d{1,2}\.20\d{2}\b/)).toEqual([]);
  });
});

describe("מקרא רק בתוך כפתור 'מקרא'", () => {
  it("כותרת הגרף (summary) אינה מסבירה סימונים", () => {
    for (const f of FILES) for (const m of f.text.matchAll(/summary=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      expect(m[1] ?? m[2], `${f.path}: סיכום שמסביר סימון`).not.toMatch(/עיגול (ריק|מלא)|נר( כחול)?\s*[:=]|קו מקווקו|קו מלא/);
    }
  });
  it("אין נקודות צבע של מקרא בבית מחוץ לכפתור", () => {
    const home = FILES.find((f) => f.path.endsWith("pages/Home.tsx"))!.text;
    expect(home).not.toMatch(/\bsw-(a|b|miss)\b/);
  });
  it("כל מקום שמצייר מקרא עושה זאת דרך ChartLegend (אחד לגרף, או אחד למסך ב-ChartBar)", () => {
    const direct = FILES.filter((f) => !f.path.endsWith("ChartLegend.tsx") && /<LegendPanel\b/.test(f.text)).map((f) => f.path);
    expect(direct).toEqual([]);
  });
});
