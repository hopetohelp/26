import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SquarePaths, MeanDot } from "./marks";
const pref = vi.hoisted(() => ({ style: "uniform" }));
vi.mock("../lib/candleStyle", () => ({ useCandleStyle: () => pref.style }));
const runs = [
  { a: 12, b: 20, half: 1.5, filled: true },
  { a: 20, b: 40, half: 5, filled: false },
  { a: 40, b: 75, half: 8, filled: false },
  { a: 75, b: 90, half: 5, filled: false },
  { a: 90, b: 110, half: 1.5, filled: true },
];
describe("בחירת נר שומרת על שני קצוות הטווח", () => {
  for (const across of ["x", "y"] as const) for (const style of ["uniform", "profile"]) {
    it(`${style}, ${across}: הקצוות 12 ו־110 נשמרים`, () => {
      pref.style = style;
      const html = renderToStaticMarkup(createElement(SquarePaths, { runs, mid: 10, across }));
      const paths = [...html.matchAll(/d="([MLZ\d.,-]+)"/g)].map(m => m[1]);
      const coords = paths.flatMap(p => [...p.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => Number(m[across === "x" ? 2 : 1])));
      expect(Math.min(...coords)).toBe(12);
      expect(Math.max(...coords)).toBe(110);
      expect(paths).toHaveLength(style === "uniform" ? 1 : 5);
      const dot = renderToStaticMarkup(createElement(MeanDot, { at: 63 }));
      expect(dot).toContain("left:63%");
      expect(dot).toContain(style === "uniform" ? "mk-dot" : "mk-mean");
    });
  }
});
