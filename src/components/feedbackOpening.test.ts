import { describe, it, expect } from "vitest";
import { openingLine } from "./Feedback";
import { isUserError, errorText } from "../pages/guess/useCrowd";
import { CrowdError } from "../lib/crowdApi";

// תקלה #327 (11.10.2026): סיסמה נוכחית שגויה בהחלפת סיסמה נשלחה לתמיכה כ"לא הצלחתי לשמור את ההשערה"
describe("error explanations", () => {
  it("opening line follows the logged action", () => {
    expect(openingLine('{"action": "החלפת סיסמה"}')).toBe("לא הצלחתי: החלפת סיסמה.");
    expect(openingLine('{"action": "שמירת השערה"}')).toBe("לא הצלחתי לשמור את ההשערה שלי.");
    expect(openingLine("{}")).toBe("לא הצלחתי לשמור את ההשערה שלי.");
  });
  it("wrong credentials are the user's to fix, not a fault to report", () => {
    const e = new CrowdError(401, "bad_credentials");
    expect(isUserError(e)).toBe(true);
    expect(errorText(e)).toMatch(/הסיסמה אינם נכונים/);
    expect(isUserError(new CrowdError(0, "network"))).toBe(false);
    expect(isUserError(new CrowdError(500, "error"))).toBe(false);
  });
});
