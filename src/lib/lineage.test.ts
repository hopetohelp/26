import { describe, expect, it } from "vitest";
import modelFile from "../data/model.json";
import { cleanLineage, DEFAULT_LINEAGE, K25_LISTS, lineageProblem, lineageRows, manualFromCurrent, seats2022ByList, start2022, VALID_2022, type Lineage } from "./lineage";

const shares = (modelFile as unknown as { central: { shares: Record<string, number> } }).central.shares;
const row = (lin: Lineage, id: string) => lineageRows(lin).rows.find((r) => r.id === id)!;
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe("שיוך רשימות 2022 לרשימות היום", () => {
  it("שלוש קטגוריות: ודאי (זהה או איחוד), חלקי (פיצול), אין שיוך (חדשה)", () => {
    expect(row(DEFAULT_LINEAGE, "likud").category).toBe("certain");
    expect(row(DEFAULT_LINEAGE, "democrats").category).toBe("certain"); // איחוד העבודה ומרצ
    expect(row(DEFAULT_LINEAGE, "rzp").category).toBe("partial");
    expect(row(DEFAULT_LINEAGE, "otzma").category).toBe("partial");
    expect(row(DEFAULT_LINEAGE, "yashar").category).toBe("partial");
    expect(row(DEFAULT_LINEAGE, "reservists").category).toBe("none");
  });

  it("איחוד = סכום הרשימות שהתאחדו", () => {
    const d = row(DEFAULT_LINEAGE, "democrats");
    const sum = K25_LISTS.filter((l) => ["העבודה", "מרצ"].includes(l.name)).reduce((t, l) => t + l.votes, 0);
    close(d.votes2022, sum);
    expect(d.seats2022).toBe(4);
  });

  it("פיצול מתחלק לפי ממוצע הסקרים, והסכום שווה לתוצאת 2022", () => {
    const ids = ["rzp", "otzma", "noam"];
    const total = ids.reduce((t, id) => t + row(DEFAULT_LINEAGE, id).seats2022, 0);
    close(total, 14);
    const w = ids.map((id) => shares[id] ?? 0);
    const W = w.reduce((a, b) => a + b, 0);
    ids.forEach((id, i) => close(row(DEFAULT_LINEAGE, id).seats2022, (14 * w[i]) / W));
  });

  it("הדוגמה של הבעלים: 14 מנדטים, סקרים 2/4/6 ⇐ 2.33/4.67/7", () => {
    const lin = { ...DEFAULT_LINEAGE, split: "crowd" as const };
    const crowd = { noam: 2, rzp: 4, otzma: 6 };
    const r = lineageRows(lin, crowd).rows;
    close(r.find((x) => x.id === "noam")!.seats2022, 14 * 2 / 12);
    close(r.find((x) => x.id === "rzp")!.seats2022, 14 * 4 / 12);
    close(r.find((x) => x.id === "otzma")!.seats2022, 7);
  });

  it("חלוקה ידנית — וסכום שאינו 100 מחזיר הסבר", () => {
    const lin: Lineage = { map: { ...DEFAULT_LINEAGE.map, noam: [] }, split: "manual", manual: { "ט": { rzp: 50, otzma: 50 }, "כן": { bluewhite: 30, yashar: 70 } } };
    expect(lineageProblem(lin)).toBeNull();
    close(row(lin, "rzp").seats2022, 7);
    expect(lineageProblem({ ...lin, manual: { ...lin.manual, "ט": { rzp: 50, otzma: 40 } } })).toMatch(/90%/);
    expect(lineageProblem({ ...lin, manual: { "ט": { rzp: 50, otzma: 50 } } })).toMatch(/המחנה הממלכתי/);
  });

  it("מעבר לחלוקה ידנית מתחיל מהחלוקה הנוכחית, ותקין", () => {
    const lin = { ...DEFAULT_LINEAGE, split: "manual" as const, manual: manualFromCurrent(DEFAULT_LINEAGE) };
    expect(lineageProblem(lin)).toBeNull();
    expect(Math.abs(row(lin, "rzp").seats2022 - row(DEFAULT_LINEAGE, "rzp").seats2022)).toBeLessThan(0.05);
  });

  it("כל קולות 2022 נספרים פעם אחת: משויכים + לא משויכים = 100%", () => {
    const { rows, unassigned2022 } = lineageRows(DEFAULT_LINEAGE);
    const assigned = rows.reduce((t, r) => t + r.votes2022, 0);
    close(assigned / VALID_2022 * 100 + unassigned2022.share, 100);
  });

  it("רשימה בלי שיוך חסרה במנדטי 2022", () => {
    expect(seats2022ByList(DEFAULT_LINEAGE).reservists).toBeUndefined();
    expect(seats2022ByList(DEFAULT_LINEAGE).likud).toBe(32);
  });

  it("ניקוי שיוך שמור: מזהים זרים נזרקים, חסר ⇐ ברירת מחדל", () => {
    const c = cleanLineage({ map: { likud: ["מחל", "xx"], nope: ["ט"] }, split: "weird", manual: { "ט": { rzp: 200 } } })!;
    expect(c.map.likud).toEqual(["מחל"]);
    expect(c.map.shas).toEqual(DEFAULT_LINEAGE.map.shas);
    expect("nope" in c.map).toBe(false);
    expect(c.split).toBe("polls");
    expect(c.manual["ט"]).toEqual({});
    expect(cleanLineage(null)).toBeNull();
  });
});

describe("התחלה מבחירות 22", () => {
  it("שלמים, בלי 1–3 מנדטים; ודאי נעול, חלקי פתוח", () => {
    const s = start2022(DEFAULT_LINEAGE);
    expect(s.likud).toEqual({ v: 32, locked: true });
    expect(s.reservists).toEqual({ v: 0, locked: false });
    expect(s.rzp.locked).toBe(false);
    expect(Object.values(s).every((c) => Number.isInteger(c.v) && (c.v === 0 || c.v >= 4))).toBe(true);
    expect(Object.values(s).reduce((t, c) => t + c.v, 0)).toBeLessThanOrEqual(120);
  });
});
