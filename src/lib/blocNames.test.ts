import { describe, expect, it } from "vitest";
import { blocAssignment } from "./electionBlocs";

/** הגוש נקרא על שם ראש הרשימה הגדולה בגוש באותה מערכת (הכרעת בעלים 04.11.2026) */
describe("שמות הגושים לפי ראש הרשימה הגדולה", () => {
  const name = (id: string, bloc: string) => blocAssignment(id)?.find((b) => b.id === bloc)?.name;
  it.each([["k19", "גוש יחימוביץ'"], ["k20", "גוש הרצוג"], ["k21", "גוש גנץ"], ["k22", "גוש גנץ"], ["k23", "גוש גנץ"], ["k24", "גוש לפיד"], ["k25", "גוש לפיד"], ["k26", "גוש אייזנקוט"]])("%s — %s", (id, expected) => {
    expect(name(id, "eisenkot")).toBe(expected);
    expect(name(id, "netanyahu")).toBe("גוש נתניהו");
  });
  it("חרדים וערבים נשארים בשם התיאורי", () => {
    expect(name("k22", "haredi")).toBe("מפלגות חרדיות");
    expect(name("k22", "arab")).toBe("מפלגות ערביות");
  });
});
