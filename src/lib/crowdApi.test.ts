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

describe("מסלולים חלופיים ובדיקת חיבור", () => {
  it("כשל ברשת במסלול אחד ⇐ המסלול השני, והוא נשאר בשימוש", async () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test-browser" });
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith("https://feedback.example/crowd")) throw new TypeError("Failed to fetch");
      return new Response('{"ok":true}');
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(call("/me", { token: "t" })).resolves.toEqual({ ok: true });
    expect(fetcher.mock.calls[0][0]).toBe("https://feedback.example/crowd/me");
    expect(fetcher.mock.calls[1][0]).toBe("https://crowd.example/me");
    fetcher.mockClear();
    await call("/me", { token: "t" });
    expect(fetcher.mock.calls[0][0]).toBe("https://crowd.example/me"); // המסלול שעבד קודם
  });
  it("שני המסלולים נכשלו ⇐ שגיאת רשת אחת עם לוג", async () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test-browser" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(call("/auth/guest", { body: {} })).rejects.toMatchObject({ code: "network", diagnostic: { method: "POST" } });
  });
  it("שני המסלולים חסומים ⇐ השמירה עוברת בממסר של שרת ההערות", async () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test-browser" });
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/relay")) return new Response('{"version":7}');
      if (url.endsWith("/autoreport") || url.endsWith("/diag")) return new Response("{}");
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await call("/save", { token: "tok", body: { unit: "seats" } })).toEqual({ version: 7 });
    const sent = fetcher.mock.calls.find(([u]) => u.endsWith("/relay"))! as unknown as [string, RequestInit];
    const inner = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(JSON.parse(sent[1].body as string).d), (c) => c.charCodeAt(0))));
    expect(inner).toEqual({ path: "/save", method: "POST", token: "tok", body: { unit: "seats" } });
  });
  it("תשובת שרת (גם שגיאה) אינה מפעילה מסלול חלופי", async () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test-browser" });
    const fetcher = vi.fn().mockResolvedValue(new Response('{"error":"bad_credentials"}', { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(call("/auth/login", { body: {} })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("סיווג תוצאות הבדיקה", async () => {
    vi.resetModules();
    const { classifyConnection } = await import("./crowdApi");
    const ok = { feedback: true, gateway: true, direct: true, post: true, postPassword: true };
    expect(classifyConnection(ok)).toBe("all-ok");
    expect(classifyConnection({ feedback: false, gateway: false, direct: false, post: false, postPassword: false })).toBe("all-blocked");
    expect(classifyConnection({ ...ok, gateway: false, direct: false, post: false, postPassword: false })).toBe("feedback-only");
    expect(classifyConnection({ ...ok, gateway: false })).toBe("direct-only");
    expect(classifyConnection({ ...ok, direct: false })).toBe("gateway-only");
    expect(classifyConnection({ ...ok, post: false })).toBe("post-blocked");
    expect(classifyConnection({ ...ok, postPassword: false })).toBe("password-blocked");
  });

  it("כשל חיבור נשלח אוטומטית לתמיכה — פעם אחת לכל כשל, בלי אסימון או סיסמה", async () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test-browser" });
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init;
      if (url.endsWith("/autoreport")) return new Response('{"ok":true}');
      throw new TypeError("Failed to fetch secret-token");
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(call("/auth/login", { token: "secret-token", body: { username: "u", password: "private-password" } })).rejects.toMatchObject({ code: "network" });
    const reports = fetcher.mock.calls.filter((c) => String(c[0]).endsWith("/autoreport"));
    expect(reports).toHaveLength(1);
    const sent = String((reports[0][1] as RequestInit).body);
    expect(sent).toContain("/auth/login");
    expect(sent).toContain("test-browser");
    for (const secret of ["secret-token", "private-password"]) expect(sent).not.toContain(secret);
  });
  it("שגיאת שרת רגילה (למשל סיסמה שגויה) אינה דיווח כשל חיבור", async () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
    vi.resetModules();
    const { call } = await import("./crowdApi");
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test-browser" });
    const fetcher = vi.fn().mockResolvedValue(new Response('{"error":"bad_credentials"}', { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(call("/auth/login", { body: {} })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
