import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import Explained from "./Explained";

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: "/", children: createElement(Explained, {
    kind: "חישוב לפי החוק", source: "מקור ארוך", asOf: "היום", assumption: "הנחה ארוכה", methodAnchor: "engine",
    children: createElement("p", null, "תוצאה: 61 מנדטים"),
    ...props,
  } as never) }));

it("בגרף: הסוג, התאריך וקישור לערך במילון; המקור וההנחה המלאים לא מוצגים (החלטה 9)", () => {
  const html = render({});
  expect(html).toContain("תוצאה: 61 מנדטים");
  expect(html).toContain("חישוב לפי החוק");
  expect(html).toContain("היום");
  expect(html).toContain('href="/method#engine"');
  expect(html).toContain("איך זה חושב?");
  expect(html).not.toContain("מקור ארוך");
  expect(html).not.toContain("הנחה ארוכה");
});

it("keeps results visible and computation details out of the initial interface", () => {
  const html = render({ details: createElement("p", null, "נוסחה ונתוני חישוב") });
  expect(html).toContain("תוצאה: 61 מנדטים");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("פירוט החישוב");
  expect(html).not.toContain("נוסחה ונתוני חישוב");
});
