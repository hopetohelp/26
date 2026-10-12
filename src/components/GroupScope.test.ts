import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GroupScope from "./GroupScope";

const groups = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, name: `קבוצה ${i + 1}` }));
const html = (n: number) => renderToStaticMarkup(createElement(GroupScope, { groups: groups(n), value: "all", onChange: () => {} }));

it("עד שלוש קבוצות — מתג, וכולן מוצגות", () => {
  for (const n of [1, 2, 3]) {
    const h = html(n);
    expect(h).toContain("radiogroup");
    expect(h).not.toContain("<select");
    for (let i = 1; i <= n; i++) expect(h).toContain(`קבוצה ${i}`);
  }
});
it("מעל שלוש — רשימת בחירה עם כל הקבוצות, בלי הגבלה", () => {
  const h = html(12);
  expect(h).toContain("<select");
  expect(h).not.toContain("radiogroup");
  expect(h).toContain("כל המשתתפים");
  expect((h.match(/<option/g) ?? []).length).toBe(13);
  expect(h).toContain("קבוצה 12");
});
