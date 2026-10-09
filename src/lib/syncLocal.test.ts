import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

/** בלי חשבון הכול בדפדפן; בהרשמה — הטיוטות, המחנות והשיחה עולים לחשבון (הכרעת בעלים 9.10.2026) */
describe("syncLocal", () => {
  it("שולח טיוטות שלא נשמרו, מחנות ושיחות שנפתחו בלי חשבון — ומנקה אותן מהדפדפן", async () => {
    vi.stubEnv("VITE_CROWD_URL", "https://crowd.example");
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    vi.stubGlobal("window", { addEventListener: () => {}, dispatchEvent: () => true });
    vi.stubGlobal("document", { addEventListener: () => {}, visibilityState: "visible" });
    vi.stubGlobal("navigator", { onLine: true, userAgent: "test" });
    store.set("elections26.crowd.draft.seats", JSON.stringify({ seats: { likud: { v: 120, src: "manual", locked: true } }, start: "zero", pollsAsOf: null }));
    store.set("elections26.camps", JSON.stringify({ likud: "right" }));
    store.set("elections26.feedback", JSON.stringify([{ token: "thread-token-123456", created: "x", preview: "p" }]));
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"ok":true,"version":{"id":1},"thread":null}')));
    vi.stubGlobal("fetch", fetcher);
    vi.resetModules();
    const { ensureSession, syncLocal } = await import("../pages/guess/useCrowd");
    expect(await ensureSession()).toBeNull();
    await syncLocal("session-token");
    const bodies = fetcher.mock.calls.map(([url, init]) => [String(url), JSON.parse(String((init as RequestInit).body ?? "{}"))]);
    expect(bodies.some(([u, b]) => u.endsWith("/save") && b.unit === "seats")).toBe(true);
    expect(bodies.some(([u, b]) => u.endsWith("/prefs") && b.camps.likud === "right")).toBe(true);
    expect(bodies.some(([, b]) => b.kind === "account-support" && b.adopt?.[0] === "thread-token-123456")).toBe(true);
    expect(store.has("elections26.crowd.draft.seats")).toBe(false);
    expect(JSON.parse(store.get("elections26.feedback")!)).toEqual([]);
  });
});
