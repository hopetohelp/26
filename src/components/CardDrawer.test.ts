import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CardDrawer from "./CardDrawer";

const html = (props: Partial<Parameters<typeof CardDrawer>[0]>) => renderToStaticMarkup(createElement(CardDrawer, { title: "כותרת", children: "תוכן", ...props }));

it("מגירה סגורה שהמשתתף לא נכנס אליה: התג מוצג, והתוכן מוסתר", () => {
  const h = html({ pendingTag: "מחכה לתשובה", seenId: "t" });
  expect(h).toContain("מחכה לתשובה");
  expect(h).not.toContain("תוכן");
});
it("מגירה פתוחה: בלי תג, עם התוכן", () => {
  const h = html({ pendingTag: "מחכה לתשובה", seenId: "t", open: true });
  expect(h).not.toContain("מחכה לתשובה");
  expect(h).toContain("תוכן");
});
it("בלי תג שהוגדר — אין תג; ונקודת לא-נשמר נעלמת כשהתג מוצג", () => {
  expect(html({})).not.toContain("מחכה");
  expect(html({ dot: true })).toContain("לא נשמר");
  expect(html({ dot: true, pendingTag: "מחכה לתשובה", seenId: "t" })).not.toContain("לא נשמר");
});
