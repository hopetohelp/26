import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CountUp from "./CountUp";

describe("ספירה מאפס בפתיחת המסך", () => {
  it("הרינדור הראשון הוא הערך הסופי (קורא מסך, בדיקות, בלי JavaScript)", () => {
    expect(renderToStaticMarkup(createElement(CountUp, { value: 23 }))).toBe("23");
    expect(renderToStaticMarkup(createElement(CountUp, { value: 12.5, format: (n) => `${n} מנדטים` }))).toBe("12.5 מנדטים");
  });
});
