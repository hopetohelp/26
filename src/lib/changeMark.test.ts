import { describe, expect, it } from "vitest";
import { ARROW_DOWN, ARROW_UP, changeLabel, changeOf } from "./changeMark";

describe("סימון שינוי: חץ במקום פלוס ומינוס", () => {
  it("עלייה — חץ למעלה, ירידה — חץ למטה, והמספר בלי סימן", () => {
    expect(changeLabel(changeOf(3606, "count"))).toBe(`${ARROW_UP} 3,606`);
    expect(changeLabel(changeOf(-18126, "count"))).toBe(`${ARROW_DOWN} 18,126`);
    expect(changeLabel(changeOf(-0.66, "pct"))).toBe(`${ARROW_DOWN} 0.7%`);
    expect(changeLabel(changeOf(2.44, "pct"))).toBe(`${ARROW_UP} 2.4%`);
  });
  it("אין שינוי — לא מוצג כלום", () => {
    expect(changeOf(0, "count")).toBeNull();
    expect(changeOf(0.04, "pct")).toBeNull();
    expect(changeOf(-0.04, "pct")).toBeNull();
    expect(changeLabel(null)).toBe("");
  });
});
