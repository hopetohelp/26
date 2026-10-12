import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import modelFile from "../data/model.json";
import InfoTip, { MODEL_INFO, ModelInfo, SCENARIO_COUNT } from "./InfoTip";

const render = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: "/", children: el }));

it("כפתור נגיש: תווית לקורא מסך, aria-expanded ו-aria-controls אל החלון, והחלון סגור בהתחלה", () => {
  const html = render(createElement(InfoTip, { label: "הסבר: בדיקה", methodAnchor: "model", children: "הסבר קצר" }));
  expect(html).toContain('type="button"');
  expect(html).toContain('aria-label="הסבר: בדיקה"');
  expect(html).toContain('aria-expanded="false"');
  const controls = html.match(/aria-controls="([^"]+)"/)?.[1];
  expect(controls).toBeTruthy();
  expect(html).toContain(`id="${controls}"`);
  expect(html).toMatch(/role="note" hidden=""/);
  expect(html).toContain('href="/method#model"');
});

it("בלי `methodAnchor` אין קישור (כשבמסך כבר יש \"איך זה חושב?\" לאותו ערך)", () => {
  const html = render(createElement(InfoTip, { label: "הסבר", children: "טקסט" }));
  expect(html).not.toContain("/method#");
  expect(html).not.toContain("איך זה חושב?");
});

it("נתוני המודל: כל נוסח אומר שהנתון אינו ישיר מהסקרים, ומספר התרחישים נלקח מ-model.json", () => {
  expect(SCENARIO_COUNT).toBe((modelFile as unknown as { params: { scenarios: number } }).params.scenarios);
  for (const k of Object.keys(MODEL_INFO) as (keyof typeof MODEL_INFO)[]) {
    const t = MODEL_INFO[k].text();
    expect(t).toMatch(/מחושב במודל|של המודל/);
    expect(t).not.toContain("הסתברות");
  }
  expect(MODEL_INFO.range.text()).toContain("20,000");
  const html = render(createElement(ModelInfo, { kind: "pass", link: false }));
  expect(html).toContain("לא נתון ישיר מהסקרים");
  expect(html).not.toContain("/method#");
});
