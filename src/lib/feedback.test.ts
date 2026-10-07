import { describe, expect, it } from "vitest";
import { isFeedbackToken, linkWithFeedback } from "./feedback";

describe("שיחת הערות בקישור האישי", () => {
  const tok = "Q7WOcjVJpUUJg8zQq5B7bA";
  it("אסימון תקין נוסף לקישור (&f=) ומוצפן לכתובת", () => {
    expect(linkWithFeedback("https://x/#/guess?t=abc", tok)).toBe(`https://x/#/guess?t=abc&f=${tok}`);
  });
  it("אין שיחה או אסימון לא תקין — הקישור לא משתנה", () => {
    expect(linkWithFeedback("https://x/#/guess?t=abc", null)).toBe("https://x/#/guess?t=abc");
    expect(linkWithFeedback("https://x/#/guess?t=abc", "<script>")).toBe("https://x/#/guess?t=abc");
  });
  it("בדיקת צורת האסימון", () => {
    expect(isFeedbackToken(tok)).toBe(true);
    expect(isFeedbackToken("short")).toBe(false);
    expect(isFeedbackToken(5)).toBe(false);
  });
});
