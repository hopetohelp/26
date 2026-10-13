import { afterEach, describe, expect, it, vi } from "vitest";
import { PARALLEL_SITE_URL, siteUrl } from "./siteUrls";

afterEach(() => vi.unstubAllGlobals());

describe("כתובת האתר לקישורי שיתוף", () => {
  it("מייצרת קישורים לדומיין הפרטי מכל כתובת שבה גולשים", () => {
    vi.stubGlobal("window", { location: { origin: "https://26.hopetohelp.net" } });
    expect(siteUrl()).toBe(PARALLEL_SITE_URL);
    vi.stubGlobal("window", { location: { origin: "https://hopetohelp.github.io" } });
    expect(siteUrl()).toBe(PARALLEL_SITE_URL);
    vi.stubGlobal("window", { location: { origin: "https://other.example" } });
    expect(siteUrl()).toBe(PARALLEL_SITE_URL);
  });
});
