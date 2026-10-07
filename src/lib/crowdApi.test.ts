import { afterEach, describe, expect, it, vi } from "vitest";


afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("לוג תקלת שמירה", () => {
  it("שומר את השגיאה המקורית והמחסנית בלי אסימון, גוף בקשה או פרמטרים אישיים", async () => {
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call, CrowdError } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test-browser" });
    const cause = new TypeError("Failed to fetch secret-token");
    cause.stack = "TypeError: Failed to fetch secret-token\n at https://site.example/app.js?t=private-link#secret:1:2";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
    try {
      await call("/save", { token: "secret-token", body: { password: "private-password", payload: "private-vote" } });
      throw new Error("הבקשה הייתה אמורה להיכשל");
    } catch (e) {
      expect(e).toBeInstanceOf(CrowdError);
      const error = e as InstanceType<typeof CrowdError>;
      expect(error.code).toBe("network");
      expect(error.diagnostic).toMatchObject({ endpoint: "https://crowd.example/save", method: "POST", browser: "test-browser", online: true });
      const log = JSON.stringify(error.diagnostic);
      for (const secret of ["secret-token", "private-link", "private-password", "private-vote"]) expect(log).not.toContain(secret);
      expect(log).toContain("TypeError");
      expect(log).toContain("app.js");
    }
  });
  it("מצרף קוד HTTP לתשובת שרת שנדחתה", async () => {
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test-browser" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })));
    await expect(call("/save", { body: {} })).rejects.toMatchObject({ status: 401, code: "unauthorized", diagnostic: { status: 401 } });
  });
});
