import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { expect, it } from "vitest";
import { Hemicycle } from "./homeCharts";
import { MethodNumbers } from "../pages/Method";
import SourcePicker from "./SourcePicker";

it("סיכום שברי נשאר מדויק במרכז, והגבולות מסומנים בחצי־חצי", () => {
  const html = renderToStaticMarkup(createElement(Hemicycle, { coalition: 52.3, arab: 13.5, opposition: 54.2, duel: ["א", "ב"] }));
  expect((html.match(/<circle /g) ?? []).length).toBe(120);
  expect((html.match(/data-split="true"/g) ?? []).length).toBe(2);
  expect((html.match(/offset="50%"/g) ?? []).length).toBe(4);
  expect(html).toContain('class="seat-a seat-in"');
  expect(html).toContain('class="seat-b seat-in"');
  expect(html).toContain('>52.3</bdi>');
  expect(html).toContain('>54.2</bdi>');
});
it("חלוקה שלמה אינה מייצרת חצאי סמלים", () => {
  const html = renderToStaticMarkup(createElement(Hemicycle, { coalition: 53, arab: 14, opposition: 53 }));
  expect(html).not.toContain('data-split="true"');
});
it("המודל נשמר בארכיון המילון אך מוסתר במסך ובבורר", () => {
  const render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: "/method", children }));
  const visible = render(createElement(MethodNumbers));
  expect(visible).not.toContain('id="model"');
  expect(visible).not.toContain('id="forecast"');
  expect(visible).toContain('ברירת מחדל קבועה לכל האתר');
  expect(render(createElement(MethodNumbers, { includeArchived: true }))).toContain('id="model"');
  const picker = render(createElement(SourcePicker, { screen: "home", selection: { product: "polls.mean" }, onChange: () => {} }));
  expect(picker).not.toContain('value="model.mean"');
  expect(picker.indexOf('value="explain"')).toBeLessThan(picker.indexOf('value="polls.mean"'));
  expect(picker).not.toContain('שמירה כמקור המועדף');
});
