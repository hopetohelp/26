import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import Explained from "./Explained";

it("keeps results visible and computation details out of the initial interface", () => {
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: "/", children: createElement(Explained, {
    kind: "חישוב לפי החוק", source: "מקור", asOf: "היום", assumption: "הנחה", methodAnchor: "engine",
    details: createElement("p", null, "נוסחה ונתוני חישוב"),
    children: createElement("p", null, "תוצאה: 61 מנדטים"),
  }) }));
  expect(html).toContain("תוצאה: 61 מנדטים");
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("נוסחה ונתוני חישוב");
});
