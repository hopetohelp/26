import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.resetModules();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
});

describe("סימון דפדפן הבעלים", () => {
  it("?nocount=1 מסמן, ?nocount=0 מבטל, והסימון נשמר בין ביקורים", async () => {
    const { isOwnerBrowser } = await import("./visits");
    expect(isOwnerBrowser("")).toBe(false);
    expect(isOwnerBrowser("?nocount=1")).toBe(true);
    expect(isOwnerBrowser("")).toBe(true);
    expect(isOwnerBrowser("?nocount=0")).toBe(false);
    expect(isOwnerBrowser("")).toBe(false);
  });
  it("setOwnerBrowser מפעיל ומכבה; בלי אחסון אין שגיאה ואין סימון", async () => {
    const { setOwnerBrowser, isOwnerBrowser } = await import("./visits");
    setOwnerBrowser(true);
    expect(isOwnerBrowser("")).toBe(true);
    setOwnerBrowser(false);
    expect(isOwnerBrowser("")).toBe(false);
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(() => setOwnerBrowser(true)).not.toThrow();
    expect(isOwnerBrowser("")).toBe(false);
  });
  it("דפדפן מסומן לא שולח כניסה; דפדפן רגיל שולח", async () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "https://fb.test");
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { pingVisit, setOwnerBrowser } = await import("./visits");
    pingVisit("/");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    setOwnerBrowser(true);
    pingVisit("/guess");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
