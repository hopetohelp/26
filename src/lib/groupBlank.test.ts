import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { blankDashboard, listsFromPolls } from "./groupBlank";
import { BlocStats, SeatsStats, VotingStats } from "../pages/guess/Dashboard";
import { votingRows } from "../pages/guess/votingRows";
import { lists2026 } from "./data";

const ids = lists2026.slice(0, 4).map((l) => l.id);
const polls = Object.fromEntries(ids.map((id, i) => [id, 30 - i * 6]));
const d = blankDashboard(12, ids, polls, null);

describe("מסך קבוצה מתחת לסף", () => {
  it("בנוי מאפסים ומהספירה בלבד, בלי שום נתון של הקבוצה", () => {
    expect(d.participants).toBe(12);
    expect(d.seats!.full.map((s) => s.list)).toEqual(ids);
    for (const s of d.seats!.full) expect(s).toMatchObject({ n: 12, mean: 0, min: 0, max: 0, median: 0, p25: 0, p75: 0 });
    expect(d.vote2026).toBeUndefined();
    expect(d.vote2022).toBeUndefined();
    expect(d.matrix).toBeUndefined();
  });
  it("הרשימות מסודרות לפי ממוצע הסקרים", () => {
    const shuffled = blankDashboard(0, [...ids].reverse(), polls, null);
    expect(shuffled.seats!.full.map((s) => s.list)).toEqual(ids);
  });
  it("רשימות מהסקרים: רק מי שמעל 4 מנדטים", () => {
    expect(listsFromPolls({ a: 3.9, b: 4, c: 12 }).sort()).toEqual(["b", "c"]);
  });
  it("טבלת המנדטים: כל הרשימות, בטור המשתתפים 0, והמונה הוא הספירה האמיתית", () => {
    const html = renderToStaticMarkup(createElement(SeatsStats, { rows: d.seats!.full, polls, view: "table", passedLists: ids }));
    expect(html).toContain("12 משתתפים");
    expect((html.match(/<tr/g) ?? []).length).toBe(ids.length + 1);
    expect(html).toContain("משתתפים</th>");
    expect(html).toContain("font-bold\">0<");
  });
  it("הגרף מוצג בלי להישבר", () => {
    expect(() => renderToStaticMarkup(createElement(SeatsStats, { rows: d.seats!.full, polls, view: "chart", passedLists: ids }))).not.toThrow();
  });
  it("טבלת הגושים: 0 במקום מקף כשהמסך ריק", () => {
    const mine = [{ name: "גוש א", lists: ids.slice(0, 2) }];
    const on = renderToStaticMarkup(createElement(StaticRouter, { location: "/" }, createElement(BlocStats, { d, blank: true, view: "table", mineBlocs: mine })));
    // מעל הסף: ממוצע הקבוצה = סכום ממוצעי המפלגות שלה (הכרעת בעלים 25.10.2026 — חלוקה קבועה מתוך ניחושי המנדטים)
    const real = { ...d, seats: { ...d.seats!, full: d.seats!.full.map((x, i) => ({ ...x, mean: i === 0 ? 5 : i === 1 ? 3 : 0 })) } };
    const off = renderToStaticMarkup(createElement(StaticRouter, { location: "/" }, createElement(BlocStats, { d: real, view: "table", mineBlocs: mine })));
    expect(on).toContain("font-bold\">0<");
    expect(off).toContain("font-bold\">8<");
  });
  it("טבלת ההצבעה: שורה לכל רשימה עם 0 בטורי המשתתפים ובלי מטריצה", () => {
    const rows = votingRows(d, ids);
    expect(rows.map((r) => r.key)).toEqual(expect.arrayContaining(ids.filter((id) => rows.some((r) => r.key === id))));
    for (const r of rows) { expect(r.next).toBe(0); expect(r.nextN).toBe(0); if (r.official !== null) expect(r.previous).toBe(0); }
    const html = renderToStaticMarkup(createElement(VotingStats, { d, blankLists: ids }));
    expect(html).toContain("12 משתתפים");
  });
});
