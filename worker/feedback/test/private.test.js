import { afterEach, beforeEach, expect, it, vi } from "vitest";
import feedback from "../index.js";
import { runAutoReplies } from "../lib/autoReply.js";
import { sealKey } from "../lib/aiKey.js";
import { fakeD1 } from "../../crowd/test/fakeD1.js";
import { sha256 } from "../../crowd/lib/crypto.js";

// הצ'אט הפרטי: המפתח האישי נשמר מוצפן לפי חשבון (הכרעת בעלים 18.10.2026); הפרדה מלאה בין מפתח האתר למפתח המשתמש, ובין שיחת המשתמש לכל מה שהשרת שומר (הכרעת בעלים 14.10.2026)
const USER_KEY = "AQ.user-private-key-" + "u".repeat(30);
const OTHER_USER_KEY = "AQ.another-user-key-" + "o".repeat(30);
const SITE_KEY = "AQ.site-db-key-" + "s".repeat(30);
const SITE_ENV_KEY = "AQ.site-env-key-" + "e".repeat(30);
const SECRET_QUESTION = "שאלה-סודית-של-המשתמש-7731";
const admin = "a".repeat(40);

let env, sent, providerStatus;
const stub = async (url, init = {}) => {
  url = String(url);
  sent.push({ url, headers: init.headers ?? {}, body: init.body ?? "" });
  if (url.startsWith("https://26.hopetohelp.net/")) return new Response("ממוצע: 32 מנדטים לגוש.", { status: 200 });
  if (providerStatus !== 200) return new Response(JSON.stringify({ error: { message: `bad key ${init.headers?.["x-goog-api-key"]}` } }), { status: providerStatus });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "לפי הנתונים: 32 מנדטים." }] } }] }), { status: 200 });
};
const providerCalls = () => sent.filter((r) => r.url.includes("generativelanguage") || r.url.includes("anthropic"));
// כל מפתח שייך לחשבון אחר; האסימון מזהה את החשבון דרך שרת ההשתתפות (מדומה)
const TOKENS = { [USER_KEY]: "token-user-a-" + "a".repeat(20), [OTHER_USER_KEY]: "token-user-b-" + "b".repeat(20) };
const post = (path, body) => feedback.fetch(new Request(`https://w.example${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, { waitUntil() {} });
const ask = (messages, key = USER_KEY) => post("/private/ask", { token: TOKENS[key], messages });
const q = (text = SECRET_QUESTION) => [{ role: "user", text }];
const dump = () => JSON.stringify(["feedback", "messages", "support_threads", "support_messages", "drafts", "settings", "ai_runs", "held", "hits", "visitors", "private_keys", "private_chats"].map((t) => env.DB.raw.prepare(`SELECT * FROM ${t}`).all()));

beforeEach(async () => {
  sent = [];
  providerStatus = 200;
  vi.stubGlobal("fetch", stub);
  env = { DB: fakeD1(new URL("../schema.sql", import.meta.url)), ALLOWED_ORIGIN: "https://x", IP_KEY: "secret", AI_API_KEY: SITE_ENV_KEY };
  await env.DB.prepare("INSERT INTO admin_keys (hash,created_at) VALUES (?,?)").bind(await sha256(admin), "2026-10-01").run();
  await env.DB.prepare("INSERT INTO settings (name, value, updated_at) VALUES ('ai_key', ?, '2026-10-14')").bind(await sealKey(env, SITE_KEY)).run();
  const owners = Object.fromEntries(Object.entries(TOKENS).map(([, t], i) => [t, `participant-${i}`]));
  env.CROWD = { fetch: async (req) => {
    const owner = owners[(req.headers.get("authorization") || "").replace("Bearer ", "")];
    return owner ? new Response(JSON.stringify({ participant: owner, thread: null })) : new Response("{}", { status: 401 });
  } };
  for (const [key, token] of Object.entries(TOKENS)) expect(await (await post("/private/key", { token, key })).json()).toEqual({ ok: true, has: true });
  sent = [];
});
afterEach(() => vi.unstubAllGlobals());

it("שאלה פרטית נשלחת לספק עם המפתח של השואל בלבד, ומפתח האתר אינו מופיע בשום בקשה יוצאת", async () => {
  const r = await ask(q());
  expect(await r.json()).toMatchObject({ ok: true, text: "לפי הנתונים: 32 מנדטים." });
  expect(providerCalls()).toHaveLength(1);
  expect(providerCalls()[0].headers["x-goog-api-key"]).toBe(USER_KEY);
  const all = JSON.stringify(sent);
  expect(all).not.toContain(SITE_KEY);
  expect(all).not.toContain(SITE_ENV_KEY);
  // ההקשר שנשלח למודל: נתוני האתר הציבוריים והשאלה — לא פרטי משתמש אחרים
  expect(providerCalls()[0].body).toContain("32 מנדטים");
});

it("שני משתמשים עם מפתחות שונים: כל קריאה נושאת רק את המפתח של שואלה, והשיחה שנשלחת היא רק שלו", async () => {
  await ask(q("שאלה של א׳"), USER_KEY);
  await ask(q("שאלה של ב׳"), OTHER_USER_KEY);
  const [a, b] = providerCalls();
  expect(a.headers["x-goog-api-key"]).toBe(USER_KEY);
  expect(b.headers["x-goog-api-key"]).toBe(OTHER_USER_KEY);
  expect(a.body).not.toContain("שאלה של ב׳");
  expect(b.body).not.toContain("שאלה של א׳");
  expect(JSON.stringify(a)).not.toContain(OTHER_USER_KEY);
  expect(JSON.stringify(b)).not.toContain(USER_KEY);
});

it("השיחה נשמרת רק מוצפנת, ואינה מגיעה לשיחות הצוות, לטיוטות או למסך הניהול", async () => {
  await ask(q());
  await ask([{ role: "user", text: "ראשונה" }, { role: "assistant", text: "תשובה" }, { role: "user", text: SECRET_QUESTION }]);
  expect(dump()).not.toContain(USER_KEY);
  expect(dump()).not.toContain(SECRET_QUESTION);
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM private_chats").get().n).toBe(1);
  const adminData = await (await feedback.fetch(new Request("https://w.example/admin/data", { headers: { authorization: `Bearer ${admin}` } }), env)).text();
  expect(adminData).not.toContain(SECRET_QUESTION);
  expect(adminData).not.toContain(USER_KEY);
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM private_hits").get().n).toBe(1);
  expect(JSON.stringify(env.DB.raw.prepare("SELECT * FROM private_hits").all())).not.toContain("participant-0");
});

it("הצ'אט הפרטי אינו משנה את מפתח האתר, את הסטטוס או את מצב התשובות האוטומטיות", async () => {
  await ask(q());
  const adminKey = await (await feedback.fetch(new Request("https://w.example/admin/ai-key", { headers: { authorization: `Bearer ${admin}` } }), env)).json();
  expect(adminKey).toMatchObject({ admin: { updated_at: "2026-10-14" }, mode: "auto", status: null });
  expect(JSON.stringify(adminKey)).not.toContain(USER_KEY);
});

it("התשובות האוטומטיות של האתר משתמשות במפתח האתר בלבד, גם אחרי שיחה פרטית", async () => {
  await ask(q());
  sent.length = 0;
  await env.DB.prepare("INSERT INTO feedback (created_at, topic, text, day_key, token_hash, status) VALUES (?, 'theory', '[שאלה או תאוריה] כמה?', 'd', 'h1', 'new')").bind("2026-10-14T09:00:00Z").run();
  await runAutoReplies(env, { teamReply: async () => true }, Date.parse("2026-10-14T12:00:00Z"), stub);
  expect(providerCalls().length).toBeGreaterThan(0);
  for (const c of providerCalls()) expect(c.headers["x-goog-api-key"]).toBe(SITE_KEY);
  expect(JSON.stringify(sent)).not.toContain(USER_KEY);
  expect(JSON.stringify(sent)).not.toContain(SECRET_QUESTION);
});

it("מפתח שגוי: שגיאה כללית, בלי המפתח ובלי גוף השגיאה של הספק", async () => {
  providerStatus = 400;
  const r = await ask(q());
  const text = await r.text();
  expect(r.status).toBe(400);
  expect(JSON.parse(text)).toEqual({ ok: false, error: "bad_key" });
  expect(text).not.toContain(USER_KEY);
  providerStatus = 429;
  expect((await (await ask(q())).json()).error).toBe("quota");
  providerStatus = 503;
  expect((await (await ask(q())).json()).error).toBe("provider");
});

it("בקשות לא תקינות נדחות לפני כל קריאה לספק", async () => {
  for (const messages of [[], [{ role: "assistant", text: "x" }], [{ role: "user", text: "a" }, { role: "assistant", text: "b" }], q("x".repeat(2001))]) {
    expect((await ask(messages)).status).toBe(400);
  }
  for (const key of ["קצר", "AQ.has space " + "k".repeat(30)]) expect((await post("/private/key", { token: TOKENS[USER_KEY], key })).status).toBe(400);
  expect(providerCalls()).toHaveLength(0);
});

it("הגבלת קצב לכל חשבון ביום, ולא לחשבון אחר", async () => {
  for (let i = 0; i < 100; i++) expect((await ask(q(), USER_KEY)).status).toBe(200);
  expect((await ask(q(), USER_KEY)).status).toBe(429);
  expect((await ask(q(), OTHER_USER_KEY)).status).toBe(200);
});

it("המפתח נשמר בשרת לפי החשבון, מוצפן, ואינו מוחזר לעולם; הסרה מוחקת אותו", async () => {
  const stored = JSON.stringify(env.DB.raw.prepare("SELECT * FROM private_keys").all());
  expect(stored).not.toContain(USER_KEY);
  expect(stored).not.toContain(OTHER_USER_KEY);
  const status = await (await post("/private/key", { token: TOKENS[USER_KEY] })).text();
  expect(JSON.parse(status)).toEqual({ ok: true, has: true });
  expect(status).not.toContain(USER_KEY);
  expect(await (await post("/private/key", { token: TOKENS[USER_KEY], key: null })).json()).toEqual({ ok: true, has: false });
  expect(await (await ask(q())).json()).toEqual({ ok: false, error: "no_key" });
  expect((await ask(q(), OTHER_USER_KEY)).status).toBe(200);
});

it("בלי חשבון: אין שמירת מפתח, אבל מפתח מהמכשיר עובד בלי לשמור דבר", async () => {
  expect((await post("/private/key", { key: USER_KEY })).status).toBe(401);
  expect((await post("/private/ask", { token: "unknown-" + "x".repeat(30), messages: q() })).status).toBe(401);
  expect(providerCalls()).toHaveLength(0);
  const before = dump();
  expect(await (await post("/private/ask", { key: OTHER_USER_KEY, messages: q() })).json()).toMatchObject({ ok: true });
  expect(providerCalls()[0].headers["x-goog-api-key"]).toBe(OTHER_USER_KEY);
  expect(dump()).toBe(before);
});

it("שיחה שמורה מוחזרת רק לבעליה, מפתח מהמכשיר עם חשבון נשמר בשיחה, וניקוי מוחק", async () => {
  await ask(q("שאלה א"));
  await post("/private/ask", { token: TOKENS[USER_KEY], key: OTHER_USER_KEY, messages: q("שאלה ב") });
  expect(providerCalls()[1].headers["x-goog-api-key"]).toBe(OTHER_USER_KEY);
  const mine = await (await post("/private/history", { token: TOKENS[USER_KEY] })).json();
  expect(mine.turns.map((t) => t.text)).toEqual(["שאלה א", "לפי הנתונים: 32 מנדטים.", "שאלה ב", "לפי הנתונים: 32 מנדטים."]);
  expect((await (await post("/private/history", { token: TOKENS[OTHER_USER_KEY] })).json()).turns).toEqual([]);
  expect((await post("/private/history", {})).status).toBe(401);
  expect((await (await post("/private/history", { token: TOKENS[USER_KEY], clear: true })).json()).turns).toEqual([]);
});

it("מודל ברירת המחדל לא קיים בחשבון (404) ⇐ ניסיון אחד עם הכינוי העדכני, עם אותו מפתח של השואל", async () => {
  vi.stubGlobal("fetch", async (url, init = {}) => {
    url = String(url);
    sent.push({ url, headers: init.headers ?? {}, body: init.body ?? "" });
    if (url.startsWith("https://26.hopetohelp.net/")) return new Response("ממוצע: 32", { status: 200 });
    if (url.includes("gemini-2.5-flash")) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "תשובה" }] } }] }), { status: 200 });
  });
  expect(await (await ask(q())).json()).toMatchObject({ ok: true, text: "תשובה" });
  expect(providerCalls().map((c) => c.headers["x-goog-api-key"])).toEqual([USER_KEY, USER_KEY]);
  expect(providerCalls()[1].url).toContain("gemini-flash-latest");
});
