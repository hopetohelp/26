import { describe, it, expect } from "vitest";
import { groupSmallRows } from "./votingRows";
const row = (key: string, previousN: number | null, nextN: number | null) => ({ key, name: key, actual: 1, official: 1, previous: 1, next: 1, previousN, nextN });
describe("רשימות אחרות", () => {
  it("רשימות עם עד 5 קולות מתאחדות לשורה אחת לפני שורות הלא־מצביעים", () => {
    const out = groupSmallRows([row("a", 10, 20), row("b", 2, 3), row("c", null, 5), row("answer:none", 1, 1)]);
    expect(out.map(r => r.key)).toEqual(["a", "small", "answer:none"]);
    expect(out[1]).toMatchObject({ name: "רשימות אחרות", previousN: 2, nextN: 8, actual: 2 });
  });
  it("רשימה קטנה אחת נשארת בשמה", () => {
    expect(groupSmallRows([row("a", 10, 20), row("b", 2, 3)]).map(r => r.key)).toEqual(["a", "b"]);
  });
});
import { groupSmallMatrix, SMALL_KEY } from "./votingRows";
describe("רשימות אחרות בטבלת המעבר", () => {
  it("שורות וטורים קטנים מתאחדים", () => {
    const c = (n: number, of: number) => ({ n, of });
    const m = { publishedAt: "", rows: { "מחל": { n: 20, cells: { likud: c(15, 20), a: c(2, 20), b: c(3, 20) } }, "x": { n: 3, cells: { likud: c(2, 3), a: c(1, 3) } }, "y": { n: 2, cells: { b: c(2, 2) } } } };
    const tot: Record<string, number> = { "מחל": 20, x: 3, y: 2 }, col: Record<string, number> = { likud: 17, a: 3, b: 5 };
    const out = groupSmallMatrix(m, (k) => tot[k], (k) => col[k]);
    expect(Object.keys(out.rows).sort()).toEqual(["מחל", SMALL_KEY].sort());
    expect(out.rows["מחל"].cells[SMALL_KEY].n).toBe(5);
    expect(out.rows[SMALL_KEY]).toMatchObject({ n: 5 });
    expect(out.rows[SMALL_KEY].cells.likud).toMatchObject({ n: 2, of: 5 });
    expect(out.rows[SMALL_KEY].cells[SMALL_KEY].n).toBe(3);
  });
});
import { realLabel } from "./votingRows";
describe("הטור האחרון בסקרי ההצבעה", () => {
  it("אחוז ולא מספר; לא הצביעו ב-2022 — מבעלי זכות הבחירה", () => {
    expect(realLabel("2022", "מחל")).toMatch(/^\d+(\.\d)?%$/);
    expect(realLabel("2022", "none")).toBe("29.4%");
  });
});
