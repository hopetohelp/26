import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Linkified from "./Linkified";

const html = (text: string) => renderToStaticMarkup(createElement(Linkified, { text }));

it("קישור חיצוני נפתח בלשונית חדשה ובלי הרשאות לדף שלנו", () => {
  const h = html("ראו https://example.com/a.");
  expect(h).toContain('<a href="https://example.com/a"');
  expect(h).toContain('target="_blank"');
  expect(h).toContain('rel="noopener noreferrer"');
  expect(h).toContain("</a><span>.</span>");
});
it("קישור לאתר עצמו (קבוצה) נפתח באותה לשונית", () => {
  const h = html("https://hopetohelp.github.io/26/#/g/hagzara");
  expect(h).toContain('href="https://hopetohelp.github.io/26/#/g/hagzara"');
  expect(h).not.toContain("target=");
});
it("טקסט הודעה אינו הופך ל-HTML", () => {
  const h = html('<img src=x onerror=alert(1)> https://a.co/x');
  expect(h).not.toContain("<img");
  expect(h).toContain("&lt;img");
});
