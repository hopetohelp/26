import { describe, expect, it } from "vitest";
import { roundTo120 } from "./communityShare";

describe("roundTo120", () => {
  it("ממוצעים שבריים ⇐ חלוקה שלמה של 120 בדיוק", () => {
    const out = roundTo120({ a: 30.4, b: 25.6, c: 20.5, d: 43.5 });
    expect(Object.values(out).reduce((x, y) => x + y, 0)).toBe(120);
    expect(out.b).toBe(26);
  });
  it("בלי נתונים ⇐ ריק", () => expect(roundTo120({})).toEqual({}));
});
