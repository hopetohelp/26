import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_SITE_URL, PARALLEL_SITE_URL, siteUrl } from "./siteUrls";

afterEach(() => vi.unstubAllGlobals());

describe("כתובת האתר לקישורי שיתוף", () => {
  it("נשארת בכתובת שבה הגולש נמצא, ומקור זר אינו משנה אותה", () => {
    vi.stubGlobal("window", { location: { origin: "https://26.hopetohelp.net" } });
    expect(siteUrl()).toBe(PARALLEL_SITE_URL);
    vi.stubGlobal("window", { location: { origin: "https://other.example" } });
    expect(siteUrl()).toBe(LEGACY_SITE_URL);
  });
});
