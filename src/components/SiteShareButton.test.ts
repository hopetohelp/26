import { describe, expect, it } from "vitest";
import { siteShareMessage } from "./SiteShareButton";

describe("שיתוף כל האתר בסרגל (הכרעת בעלים 02.11.2026)", () => {
  it("בחלק הבחירות — ניסוח וקישור לבחירות; באזור הניחושים — לניחושים", () => {
    expect(siteShareMessage("elections").url).toMatch(/#\/results$/);
    expect(siteShareMessage("guesses").url).toMatch(/#\/surveys$/);
    expect(siteShareMessage("elections").text).toContain("בחירות 2026");
    expect(siteShareMessage("guesses").text).toContain("ניחושים");
  });
});
