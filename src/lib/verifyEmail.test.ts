import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function load(reply?: { status: number; body: object }) {
  vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
  vi.resetModules();
  const fetcher = vi.fn(async () => new Response(JSON.stringify(reply?.body ?? { verified: true }), { status: reply?.status ?? 200 }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("navigator", { onLine: true, userAgent: "test" });
  return { fetcher, mod: await import("./verifyEmail") };
}

describe("אימות מייל מהקישור", () => {
  it("שולח את הקוד פעם אחת בלבד, גם אם נקרא פעמיים, ומחזיר ok", async () => {
    const { fetcher, mod } = await load();
    mod.setVerifyCode("ABCDEFGHIJKLMNOP1234");
    const [a, b] = await Promise.all([mod.verifyEmailOnce(), mod.verifyEmailOnce()]);
    expect([a, b]).toEqual(["ok", "ok"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ oobCode: "ABCDEFGHIJKLMNOP1234" });
  });
  it("קוד לא תקף ⇐ bad, פג תוקף ⇐ expired, שגיאת שרת ⇐ error", async () => {
    for (const [code, state] of [["bad_code", "bad"], ["expired_code", "expired"], ["server", "error"]] as const) {
      const { mod } = await load({ status: code === "server" ? 500 : 400, body: { error: code } });
      mod.setVerifyCode("ABCDEFGHIJKLMNOP1234");
      expect(await mod.verifyEmailOnce()).toBe(state);
    }
  });
  it("בלי קוד ⇐ bad, ובלי שליחה", async () => {
    const { fetcher, mod } = await load();
    expect(await mod.verifyEmailOnce()).toBe("bad");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
