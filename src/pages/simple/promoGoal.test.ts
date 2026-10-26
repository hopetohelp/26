import { describe, expect, it } from "vitest";
import { nextGoal } from "./PromoVideo";

describe("יעד המונה בסרטון", () => {
  it("2,000 עד שעוברים אותו", () => {
    expect(nextGoal(0)).toBe(2000);
    expect(nextGoal(1253)).toBe(2000);
    expect(nextGoal(1999)).toBe(2000);
  });
  it("כל פעם שעוברים את היעד — עוד 500", () => {
    expect(nextGoal(2000)).toBe(2500);
    expect(nextGoal(2499)).toBe(2500);
    expect(nextGoal(2500)).toBe(3000);
    expect(nextGoal(123456)).toBe(123500);
  });
});
