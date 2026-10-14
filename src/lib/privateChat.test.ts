import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// הצ'אט הפרטי (הכרעת בעלים 14.10.2026): המפתח בדפדפן בלבד, והבקשה לשרת נושאת רק מפתח ושיחה — בלי אסימון, חשבון או מזהה.
const KEY = "AQ.personal-key-" + "p".repeat(30);

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), has: (k: string) => m.has(k) };
}
let local: ReturnType<typeof memoryStore>, session: ReturnType<typeof memoryStore>;

async function load() {
  vi.resetModules();
  vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
  return import("./privateChat");
}

beforeEach(() => {
  local = memoryStore(); session = memoryStore();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("שמירת המפתח האישי", () => {
  it("כברירת מחדל רק עד סגירת הלשונית (sessionStorage), ולא בשמירה קבועה", async () => {
    const { setPrivateKey, getPrivateKey } = await load();
    expect(setPrivateKey(KEY, false)).toBe(true);
    expect(session.has("elections26.privateKey")).toBe(true);
    expect(local.has("elections26.privateKey")).toBe(false);
    expect(getPrivateKey()).toBe(KEY);
  });
  it("בבחירה 'לזכור' — שמירה קבועה בלבד, והסרה מוחקת את שניהם", async () => {
    const { setPrivateKey, getPrivateKey, clearPrivateKey } = await load();
    setPrivateKey(KEY, true);
    expect(local.has("elections26.privateKey")).toBe(true);
    expect(session.has("elections26.privateKey")).toBe(false);
    clearPrivateKey();
    expect(getPrivateKey()).toBeNull();
    expect(local.has("elections26.privateKey")).toBe(false);
  });
  it("מפתח לא תקין אינו נקרא חזרה, ואחסון חסום מחזיר false", async () => {
    const { getPrivateKey, setPrivateKey, isPlausibleKey } = await load();
    session.setItem("elections26.privateKey", "קצר");
    expect(getPrivateKey()).toBeNull();
    expect(isPlausibleKey("יש רווח " + "k".repeat(30))).toBe(false);
    vi.stubGlobal("sessionStorage", { ...session, setItem: () => { throw new Error("blocked"); }, getItem: () => null, removeItem: () => {} });
    expect(setPrivateKey(KEY, false)).toBe(false);
  });
});

describe("הקריאה לשרת", () => {
  it("נשלחים רק מפתח ושיחה, ל-/private/ask, בלי עוגיות, בלי מזהה חשבון ובלי שום שמירה", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ ok: true, text: "תשובה" }), { status: 200 }); });
    const { askPrivate } = await load();
    const out = await askPrivate(KEY, [{ role: "user", text: "א" }, { role: "assistant", text: "ב" }], "ג");
    expect(out).toEqual({ ok: true, text: "תשובה" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://feedback.example/private/ask");
    expect(calls[0].init.credentials).toBe("omit");
    expect(Object.keys(JSON.parse(String(calls[0].init.body))).sort()).toEqual(["key", "messages"]);
    expect(Object.keys(calls[0].init.headers as object)).toEqual(["content-type"]);
    expect(local.has("elections26.feedback")).toBe(false);
  });
  it("נשלחות רק שש השאלות והתשובות האחרונות, ותמיד מתחילות בשאלה", async () => {
    const { recentTurns } = await load();
    const history = Array.from({ length: 16 }, (_, i) => ({ role: i % 2 ? "assistant" as const : "user" as const, text: String(i) }));
    const sent = recentTurns(history);
    expect(sent).toHaveLength(10);
    expect(sent[0].role).toBe("user");
    expect(sent[sent.length - 1].role).toBe("assistant");
  });
  it("שגיאות הספק מתורגמות, בלי להחזיר את גוף השגיאה", async () => {
    const { askPrivate } = await load();
    for (const [error, expected] of [["bad_key", "bad_key"], ["quota", "quota"], ["rate", "rate"], ["provider", "unavailable"]] as const) {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: false, error, detail: KEY }), { status: 400 }));
      expect(await askPrivate(KEY, [], "ש")).toEqual({ ok: false, error: expected });
    }
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    expect(await askPrivate(KEY, [], "ש")).toEqual({ ok: false, error: "offline" });
  });
});
