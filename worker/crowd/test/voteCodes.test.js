import { describe, expect, it } from "vitest";
import { validateVote } from "../lib/validate.js";
import { V2026_SPECIAL } from "../../../src/lib/crowdValidate";

// כל אפשרות שהאתר מציע ל-2026 חייבת לעבור גם בשרת (תקלה 24.10.2026: "לא הייתה לי זכות הצבעה" נדחתה ב-400)
describe("קודי הצבעה 2026", () => {
  it.each([...V2026_SPECIAL])("%s מתקבל בשרת", (code) => {
    expect(validateVote({ v2022: null, v2026: code }).ok).toBe(true);
  });
});
