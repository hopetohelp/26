import { afterEach, describe, expect, it, vi } from "vitest";


afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("לוג תקלת שמירה", () => {
  it("uses the feedback gateway for authenticated saves when configured", async () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example/");
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetcher);
    await call("/save", { token: "session-token", body: { mode: "seats" } });
    expect(fetcher).toHaveBeenCalledWith("https://feedback.example/crowd/save", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer session-token" }) }));
  });
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
  it("מצרף לוג לתקלת הרשמה ומסיר גם פרטי כניסה מהשגיאה המקורית", async () => {
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: false, userAgent: "test-browser" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch private-user private-password")));
    try {
      await call("/auth/register", { body: { username: "private-user", password: "private-password" } });
      throw new Error("הבקשה הייתה אמורה להיכשל");
    } catch (e) {
      expect(e).toMatchObject({ code: "network", diagnostic: { endpoint: "https://crowd.example/auth/register", online: false, cause: { name: "TypeError" } } });
      const log = JSON.stringify(e);
      expect(log).not.toContain("private-user");
      expect(log).not.toContain("private-password");
      expect(log).toContain("Failed to fetch");
    }
  });
  it("dashboard requests bypass a cached snapshot", async () => {
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ open: true, seats: { n: 5 } })));
    vi.stubGlobal("fetch", fetcher);
    await expect(call("/dashboard")).resolves.toMatchObject({ seats: { n: 5 } });
    expect(fetcher).toHaveBeenCalledWith("https://crowd.example/dashboard", expect.objectContaining({ cache: "no-store" }));
  });

});
