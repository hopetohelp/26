import { describe, expect, it } from "vitest";
import { embedCode, embeddableFor, embedTheme, embedUrl, isEmbed } from "./embed";

describe("מצב הטמעה", () => {
  it("מזהה embed=1 ותצורה בכתובת", () => {
    expect(isEmbed("#/results-2026?embed=1")).toBe(true);
    expect(isEmbed("#/results-2026")).toBe(false);
    expect(embedTheme("#/past?tab=changes&embed=1&theme=dark")).toBe("dark");
    expect(embedTheme("#/past?embed=1&theme=x")).toBe("light");
    expect(embedTheme("#/results-2026?embed=1")).toBe("light");
    expect(embedTheme("#/past?embed=1&theme=auto")).toBe("auto");
    expect(embedTheme("#/past?theme=dark")).toBe(null);
  });
  it("רק תוצאות ומה השתנה ניתנים להטמעה", () => {
    expect(embeddableFor("/results-2026", null)?.name).toBe("תוצאות");
    expect(embeddableFor("/past", "changes")?.name).toBe("מה השתנה");
    expect(embeddableFor("/past", "results")).toBe(null);
    expect(embeddableFor("/polls", null)).toBe(null);
  });
  it("קוד ההטמעה מכיל את הכתובת ובודק מקור", () => {
    const e = embeddableFor("/past", "changes")!;
    expect(embedUrl(e)).toBe("https://26.hopetohelp.net/#/past?tab=changes&embed=1&theme=light");
    expect(embedCode(e, "auto")).toContain('src="https://26.hopetohelp.net/#/past?tab=changes&embed=1&theme=auto"');
    expect(embedCode(e)).toContain('m.origin!=="https://26.hopetohelp.net"');
  });
});
