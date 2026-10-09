import { describe, expect, it } from "vitest";
import historyFile from "../data/history.json";
import { results } from "./data";
import { compareLists, eveSnapshot, type Cycle, type ElectionResult } from "./history";
import { deviation, finding, type DevInput } from "./deviation";

const row = (id: string, estimate: number, min: number, max: number, actual: number, n = 4): DevInput => ({ id, name: id, estimate, min, max, actual, n, values: n ? [min, max] : [] });

describe("deviation", () => {
  const d = deviation([row("a", 8.5, 8, 9, 11), row("b", 24, 23, 27, 24), row("c", 4, 4, 4, 5), row("d", 4.5, 4, 5, 0), row("x", NaN, NaN, NaN, 3, 0)]);

  it("מחוץ לטווח: התוצאה קטנה מהנמוך או גדולה מהגבוה; בתוך הטווח כולל קצוות", () => {
    expect(d.outside.map((r) => r.id)).toEqual(["d", "a", "c"]);
    expect(d.inside.map((r) => r.id)).toEqual(["b"]);
  });
  it("הסטייה היא התוצאה פחות ממוצע הסקרים, והטווח ביחס לממוצע", () => {
    const a = d.outside.find((r) => r.id === "a")!;
    expect([a.dev, a.lo, a.hi]).toEqual([2.5, -0.5, 0.5]);
  });
  it("רשימה שאף סקר לא שאל עליה אינה בגרף, ונספרת בנפרד", () => {
    expect(d.notAsked.map((r) => r.id)).toEqual(["x"]);
    expect(d.askedCount).toBe(4);
  });
  it("חצי הציר: 3 לפחות, ומעל הסטייה הגדולה ביותר", () => {
    expect(deviation([row("a", 5, 4, 6, 5)]).bound).toBe(3);
    expect(d.bound).toBe(5);
  });
  it("הכותרת היא הממצא", () => {
    expect(finding(4, 11)).toBe("ב-4 מתוך 11 רשימות התוצאה יצאה מחוץ לטווח הסקרים.");
    expect(finding(0, 7)).toBe("בכל 7 הרשימות התוצאה הייתה בתוך טווח הסקרים.");
  });
});

describe("הסקרים מול התוצאות בנתונים האמיתיים (2022)", () => {
  const cycles = historyFile.cycles as unknown as Cycle[];
  const c = cycles.find((x) => x.id === "k25")!;
  const r = (results as unknown as ElectionResult[]).find((x) => x.id === "k25")!;
  const rows = compareLists(c, r, eveSnapshot(c)).map((x) => ({ id: x.letters, name: x.name, estimate: x.estimate, min: x.min, max: x.max, actual: x.actual, n: x.n, values: x.values }));
  const d = deviation(rows);

  it("ש״ס יצאה מחוץ לטווח הסקרים (11 מול 8 עד 9), כפי שנמדד בהצעה", () => {
    const shas = d.outside.find((x) => x.name.includes("ש"));
    expect(shas, "אין שורה לש״ס מחוץ לטווח").toBeTruthy();
    expect(shas!.actual).toBe(11);
  });
  it("הרשימות בגרף יחד עם אלה שלא נשאלו הן כל הרשימות שהושוו", () => {
    expect(d.outside.length + d.inside.length + d.notAsked.length).toBe(rows.length);
  });
});

describe("נר הסטייה: קטעים לפי כמה מכונים נתנו כל ערך, ביחס לממוצע", () => {
  it("הקטעים מתחילים בנמוך ונגמרים בגבוה, ומוזזים בממוצע הסקרים (0 = הממוצע)", () => {
    const base = { name: "x", estimate: 10, min: 8, max: 12, actual: 11, n: 5 };
    const d = deviation([{ ...base, id: "a", values: [8, 10, 10, 10, 12] }]);
    const segs = d.inside[0].segs;
    expect(segs[0].from).toBe(8 - 10);
    expect(segs[segs.length - 1].to).toBe(12 - 10);
    const mid = segs.find((g) => g.from <= 0 && g.to >= 0)!;
    expect(mid.count).toBe(3);
  });
});
