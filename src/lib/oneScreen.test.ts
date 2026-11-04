import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { electionData } from "./electionData";
import { ELECTIONS, K26_ID } from "./election";
import { blocAssignment } from "./electionBlocs";

/**
 * מסך אחד לכל מערכת (הכרעת בעלים 04.11.2026: "בכל מערכות הבחירות המסך אותו מסך של הגרסה המעודכנת של 26, השינוי רק הנתונים.
 * לוודא שאין בטעות עותק או גרסה שונה"). הבדיקה נכשלת אם מסך בחירות מקבל רכיב שונה לפי מערכת, או אם נוסף מסך מיוחד לשנה מסוימת.
 */
const SRC = readFileSync("src/pages/ElectionScreens.tsx", "utf8");
const code = SRC.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
/** גוף הפונקציה של מסך, עד הפונקציה הבאה ברמה העליונה */
const body = (name: string) => {
  const i = code.indexOf(`export function ${name}(`);
  expect(i, name).toBeGreaterThanOrEqual(0);
  const rest = code.slice(i + 1);
  const j = rest.search(/\n(export )?(function|const) /);
  return j < 0 ? rest : rest.slice(0, j);
};
/** מסכים שעדיין מפוצלים — מתרוקן עד סוף העבודה (PR "מה השתנה") */
const STILL_SPLIT: string[] = [];

describe("מסך אחד לכל מערכת", () => {
  it("אין הסתעפות לפי מערכת מסוימת במסכי הבחירות (רק 'סיכום')", () => {
    for (const name of ["ResultsScreen", "ChangesScreen", "PollsScreen"].filter((n) => !STILL_SPLIT.includes(n))) {
      const b = body(name);
      expect(b, name).not.toMatch(/K26_ID|["']k2\d["']|\bknesset\s*===|\bid\s*===\s*(?!\s|SUMMARY_ID)/);
    }
  });
  it("אין רכיב או קובץ מיוחד לשנה מסוימת ואין רכיב 'עבר' נפרד", () => {
    const imports = [...code.matchAll(/from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)].map((m) => m[1] ?? m[2]);
    expect(imports.filter((p) => /20\d\d|Past|Accuracy["']?$/.test(p) && !p.endsWith("/Accuracy"))).toEqual([]);
    const special = [...code.matchAll(/function (\w*(?:20\d\d|Past)\w*)\(/g)].map((m) => m[1]);
    // PastChanges יוסר עם איחוד "מה השתנה" (STILL_SPLIT)
    expect(special.filter((n) => !(n === "PastChanges" && STILL_SPLIT.includes("ChangesScreen")))).toEqual([]);
    // ממסך הדיוק הישן נשארה רק ההשוואה בין המערכות ("סיכום")
    expect(code).not.toMatch(/import Accuracy\b|<Accuracy\b/);
  });
  it("כל מערכת בבורר מקבלת נתונים משלה, באותו מבנה", () => {
    for (const e of ELECTIONS) {
      const d = electionData(e.id);
      expect(d.id, e.id).toBe(e.id);
      expect(d.polls.length, e.id).toBeGreaterThan(0);
      expect(d.blocs.length, e.id).toBeGreaterThan(0);
      for (const p of d.polls) expect(typeof p.firm === "string" && typeof p.end === "string" && typeof p.values === "object", p.id).toBe(true);
      if (e.id !== K26_ID) {
        expect(d.result, e.id).not.toBeNull();
        // הסקר האחרון של כל מכון — מתוך סקרי אותה מערכת
        for (const id of d.finalIds) expect(d.polls.some((p) => p.id === id)).toBe(true);
      }
    }
  });
  it("סטטוס האימות של סקרי העבר מגיע לאתר כשהוא קיים (2015)", () => {
    const d = electionData("k20");
    expect(d.polls.filter((p) => p.verified).length).toBeGreaterThan(0);
  });
  it("רכיבי שלושת המסכים אינם מייבאים קובץ מיוחד לשנה", () => {
    for (const f of ["Results", "Polls", "Trends", "VoterFlow"]) {
      const text = readFileSync(`src/pages/${f}.tsx`, "utf8");
      expect(text, f).not.toMatch(/from\s+["']\.\/\w*20\d\d\w*["']/);
    }
  });
  it("שיוך גושים אחד לכרטיס התוצאות ולטבלאות הסקרים", () => {
    expect(blocAssignment(K26_ID)?.length).toBe(4);
    const k25 = blocAssignment("k25")!;
    expect(k25.map((b) => b.id)).toEqual(["netanyahu", "haredi", "arab", "eisenkot"]);
    expect(electionData("k25").blocs).toEqual(k25);
  });
});
