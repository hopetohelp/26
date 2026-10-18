import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// הצ'אט הפרטי (הכרעת בעלים 18.10.2026): המפתח בחשבון (בשרת) או במכשיר בלבד, לבחירת המשתמש.
const KEY = "AQ.personal-key-" + "p".repeat(30);
const TOKEN = "session-token-" + "t".repeat(20);

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

type Call = { url: string; body: Record<string, unknown> };
function server(reply: (c: Call) => object, calls: Call[] = []) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => { const c = { url, body: JSON.parse(String(init.body)) }; calls.push(c); expect(init.credentials).toBe("omit"); return new Response(JSON.stringify(reply(c)), { status: 200 }); });
  return calls;
}

describe("המפתח האישי נשמר בשרת לפי החשבון", () => {
  it("שמירה שולחת אסימון ומפתח ל-/private/key, ואינה משאירה את המפתח בדפדפן", async () => {
    local.setItem("elections26.crowd.token", TOKEN);
    const calls = server(() => ({ ok: true, has: true }));
    const { savePrivateKey } = await load();
    expect(await savePrivateKey(KEY)).toBeNull();
    expect(calls).toEqual([{ url: "https://feedback.example/private/key", body: { token: TOKEN, key: KEY } }]);
    expect(local.has("elections26.privateKey")).toBe(false);
    expect(session.has("elections26.privateKey")).toBe(false);
  });
  it("בלי חשבון אין שמירה ואין פנייה לשרת", async () => {
    const calls = server(() => ({ ok: true }));
    const { savePrivateKey, askPrivate } = await load();
    expect(await savePrivateKey(KEY, "account")).toMatch(/להיכנס לחשבון/);
    expect(await askPrivate([], "ש")).toEqual({ ok: false, error: "unauthorized" });
    expect(calls).toHaveLength(0);
  });
  it("במכשיר בלבד: בלי חשבון ובלי פנייה לשמירה, והמפתח נשלח עם השאלה", async () => {
    const calls = server(() => ({ ok: true, text: "תשובה" }));
    const { savePrivateKey, askPrivate } = await load();
    expect(await savePrivateKey(KEY, "device")).toBeNull();
    expect(local.getItem("elections26.privateKey")).toBe(KEY);
    expect(calls).toHaveLength(0);
    expect(await askPrivate([], "ש")).toEqual({ ok: true, text: "תשובה" });
    expect(calls[0].body).toEqual({ key: KEY, messages: [{ role: "user", text: "ש" }] });
  });
  it("השיחה השמורה נטענת ונמחקת מול השרת עם האסימון", async () => {
    local.setItem("elections26.crowd.token", TOKEN);
    const turns = [{ role: "user", text: "א" }, { role: "assistant", text: "ב" }];
    const calls = server(() => ({ ok: true, turns }));
    const { loadPrivateHistory, clearPrivateHistory } = await load();
    expect(await loadPrivateHistory()).toEqual(turns);
    await clearPrivateHistory();
    expect(calls.map((c) => [c.url, c.body])).toEqual([["https://feedback.example/private/history", { token: TOKEN }], ["https://feedback.example/private/history", { token: TOKEN, clear: true }]]);
  });
});

describe("הקריאה לשרת", () => {
  it("נשלחים רק אסימון ושיחה ל-/private/ask — לא המפתח", async () => {
    local.setItem("elections26.crowd.token", TOKEN);
    const calls = server(() => ({ ok: true, text: "תשובה" }));
    const { askPrivate } = await load();
    expect(await askPrivate([{ role: "user", text: "א" }, { role: "assistant", text: "ב" }], "ג")).toEqual({ ok: true, text: "תשובה" });
    expect(calls[0].url).toBe("https://feedback.example/private/ask");
    expect(Object.keys(calls[0].body).sort()).toEqual(["messages", "token"]);
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
    local.setItem("elections26.crowd.token", TOKEN);
    const { askPrivate } = await load();
    for (const [error, expected] of [["bad_key", "bad_key"], ["quota", "quota"], ["rate", "rate"], ["no_key", "no_key"], ["provider", "unavailable"]] as const) {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: false, error, detail: KEY }), { status: 400 }));
      expect(await askPrivate([], "ש")).toEqual({ ok: false, error: expected });
    }
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    expect(await askPrivate([], "ש")).toEqual({ ok: false, error: "offline" });
  });
});
