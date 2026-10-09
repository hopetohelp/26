import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from "vitest";
import worker from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { seats } from "./helpers.js";
import { normalizeEmail } from "../lib/identity.js";
import { sha256 } from "../lib/crypto.js";

/** חשבונות (הכרעת בעלים 9.10.2026): מייל או Google חובה, חשבון אחד לכל מייל, מייל ושם מוצפנים, בלי אורח חדש */
const CLIENT = "test-client.apps.googleusercontent.com";
let env, keyPair, jwk;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
async function google(claims) {
  const head = enc({ alg: "RS256", kid: "k1", typ: "JWT" });
  const body = enc({ iss: "https://accounts.google.com", aud: CLIENT, sub: "g-1", exp: Date.parse("2026-10-08T11:00:00Z") / 1000, email: "Someone@Gmail.com", email_verified: true, ...claims });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}
beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  jwk = { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: "k1" };
});
beforeEach(() => {
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", IP_KEY: "k", DATA_KEY: "d", GOOGLE_CLIENT_ID: CLIENT, GOOGLE_JWKS: [jwk], NOW: () => Date.parse("2026-10-08T10:00:00Z") };
});
let ip = 0;
const call = async (path, { body, token } = {}) => {
  const res = await worker.fetch(new Request("https://w.example" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin: env.ALLOWED_ORIGIN, "cf-connecting-ip": `9.9.${ip >> 8}.${ip++ & 255}`, ...(token ? { authorization: "Bearer " + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: res.status, data: await res.json().catch(() => null) };
};
const save = (token) => call("/save", { token, body: { unit: "seats", op_id: "op-" + Math.random().toString(36).slice(2, 12), registry: "r", payload: seats(60) } });
const PW = "a fine password 1";
/** חשבון ישן (לפני 9.10.2026) — נוצר ישירות במאגר: אורח, או שם משתמש שהוא מייל גלוי */
async function legacy({ username = null } = {}) {
  const id = "legacy-" + Math.random().toString(36).slice(2);
  const token = "T".repeat(20) + Math.random().toString(36).slice(2, 20).padEnd(23, "x");
  env.DB.raw.prepare("INSERT INTO participants (id, created_at) VALUES (?, ?)").run(id, "2026-10-07T00:00:00Z");
  env.DB.raw.prepare("INSERT INTO sessions (token_hash, participant, created_at, expires_at) VALUES (?, ?, ?, ?)").run(await sha256(token), id, "2026-10-07T00:00:00Z", "2026-11-07T00:00:00Z");
  if (username) {
    const { hashPassword } = await import("../lib/crypto.js");
    const h = await hashPassword(PW);
    env.DB.raw.prepare("INSERT INTO credentials (participant, kind, username, username_norm, hash, salt, iterations, algo, created_at) VALUES (?, 'password', ?, ?, ?, ?, ?, ?, ?)").run(id, username, username.toLowerCase(), h.hash, h.salt, h.iterations, h.algo, "x");
  }
  return token;
}
const dump = () => JSON.stringify(env.DB.raw.prepare("SELECT * FROM emails").all()) + JSON.stringify(env.DB.raw.prepare("SELECT * FROM profile").all()) + JSON.stringify(env.DB.raw.prepare("SELECT * FROM credentials").all());

describe("נרמול מייל", () => {
  it("אותיות קטנות; ב-Gmail בלי נקודות ובלי +תוספת", () => {
    expect(normalizeEmail(" A.B+news@GoogleMail.com ")).toEqual({ display: "a.b+news@googlemail.com", norm: "ab@gmail.com" });
    expect(normalizeEmail("A.B+x@example.org").norm).toBe("a.b+x@example.org");
    expect(normalizeEmail("no-at-sign")).toBeNull();
  });
});

describe("חשבון = מייל או Google", () => {
  it("אין אורח חדש בשרת; הרשמה דורשת מייל", async () => {
    expect((await call("/auth/guest", { body: {} })).data.error).toBe("account_required");
    expect((await call("/auth/register", { body: { username: "dani", password: PW } })).data.error).toBe("email_required");
  });

  it("חשבון אחד לכל מייל, גם בכתיבה אחרת של אותה כתובת Gmail", async () => {
    expect((await call("/auth/register", { body: { email: "a.b@gmail.com", password: PW, name: "דני" } })).status).toBe(200);
    expect((await call("/auth/register", { body: { email: "AB+2@gmail.com", password: PW } })).data.error).toBe("email_taken");
    expect((await call("/auth/login", { body: { email: "ab@gmail.com", password: PW } })).status).toBe(200);
  });

  it("מייל ושם נשמרים מוצפנים — אין טקסט גלוי במאגר; /me מציג אותם לבעל החשבון", async () => {
    const r = await call("/auth/register", { body: { email: "private.person@example.com", password: PW, name: "שם פרטי" } });
    expect(dump()).not.toContain("private.person");
    expect(dump()).not.toContain("שם פרטי");
    const me = (await call("/me", { token: r.data.token })).data;
    expect(me).toMatchObject({ name: "שם פרטי", emails: [{ email: "private.person@example.com" }], needsEmail: false });
    await call("/account/name", { token: r.data.token, body: { name: "שם אחר" } });
    expect((await call("/me", { token: r.data.token })).data.name).toBe("שם אחר");
  });

  it("Google: אותו מייל מאומת ⇐ אותו חשבון; רישום לא מאומת של המייל בחשבון אחר עובר לבעל ה-Google", async () => {
    const squat = await call("/auth/register", { body: { email: "someone@gmail.com", password: PW } });
    const g = await call("/auth/google", { body: { credential: await google({}) } });
    expect(g.status).toBe(200);
    const me = (await call("/me", { token: g.data.token })).data;
    expect(me.participant).not.toBe((await call("/me", { token: squat.data.token })).data.participant);
    expect(me.emails[0]).toMatchObject({ email: "someone@gmail.com", verified: true });
    expect((await call("/me", { token: squat.data.token })).data.needsEmail).toBe(true);
    // כניסה עם Google אחר שהמייל שלו כבר מאומת בחשבון ⇐ אותו חשבון
    const again = await call("/auth/google", { body: { credential: await google({ sub: "g-2", email: "some.one@gmail.com" }) } });
    expect((await call("/me", { token: again.data.token })).data.participant).toBe(me.participant);
  });

  it("חשבון Google יכול לקבוע סיסמה ולהיכנס במייל", async () => {
    const g = await call("/auth/google", { body: { credential: await google({}) } });
    expect((await call("/account/password", { token: g.data.token, body: { password: PW } })).status).toBe(200);
    expect((await call("/auth/login", { body: { email: "someone@gmail.com", password: PW } })).status).toBe(200);
  });
});

describe("משתמשים קיימים", () => {
  it("אורח ישן: needsEmail, ממשיך לשמור; הוספת מייל וסיסמה יוצרת קישור אישי", async () => {
    const t = await legacy();
    expect((await call("/me", { token: t })).data).toMatchObject({ needsEmail: true, guest: true });
    expect((await save(t)).status).toBe(200);
    expect((await call("/auth/claim", { token: t, body: { email: "late@example.com", password: "short" } })).data.error).toBe("weak_password");
    const c = await call("/auth/claim", { token: t, body: { email: "late@example.com", password: PW } });
    expect(c.data).toMatchObject({ email: "late@example.com" });
    expect(c.data.link).toMatch(/^[\w-]{20,}$/);
    const me = (await call("/me", { token: t })).data;
    expect(me).toMatchObject({ needsEmail: false, hasPassword: true });
    expect(me.latest.seats).toBeTruthy();
    expect((await call("/auth/login", { body: { email: "late@example.com", password: PW } })).status).toBe(200);
  });

  it("שם משתמש ישן: מוסיף מייל בלי סיסמה חדשה; מייל תפוס נדחה", async () => {
    await call("/auth/register", { body: { email: "taken@example.com", password: PW } });
    const t = await legacy({ username: "old_name" });
    expect((await call("/me", { token: t })).data.needsEmail).toBe(true);
    expect((await call("/auth/claim", { token: t, body: { email: "taken@example.com" } })).data.error).toBe("email_taken");
    expect((await call("/auth/claim", { token: t, body: { email: "mine@example.com" } })).status).toBe(200);
    expect((await call("/auth/login", { body: { username: "old_name", password: PW } })).status).toBe(200);
    expect((await call("/auth/login", { body: { email: "mine@example.com", password: PW } })).status).toBe(200);
  });

  it("מייל ישן כשם משתמש גלוי ⇐ עובר להצפנה בכניסה", async () => {
    await legacy({ username: "visible@example.com" });
    expect(dump()).toContain("visible@example.com");
    expect((await call("/auth/login", { body: { email: "visible@example.com", password: PW } })).status).toBe(200);
    expect(dump()).not.toContain("visible@example.com");
    expect((await call("/auth/register", { body: { email: "visible@example.com", password: PW } })).data.error).toBe("email_taken");
    expect((await call("/auth/login", { body: { email: "visible@example.com", password: PW } })).status).toBe(200);
  });

  it("מחיקת חשבון מוחקת גם מייל ושם", async () => {
    const r = await call("/auth/register", { body: { email: "gone@example.com", password: PW, name: "x" } });
    expect((await call("/delete", { token: r.data.token, body: { confirm: "מחק" } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM emails").get().n).toBe(0);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM profile").get().n).toBe(0);
  });
});


/** אימות מייל דרך Firebase (הכרעת בעלים 9.10.2026) — Firebase מדומה: משתמשים לפי מייל, שליחת מייל וסימון אימות */
describe("אימות מייל", () => {
  let users, sent, deleted;
  beforeEach(() => {
    users = new Map(); sent = []; deleted = [];
    env.FIREBASE_API_KEY = "test-key";
    env.SITE_URL = "https://hopetohelp.github.io/26/";
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const method = String(url).split("accounts:")[1].split("?")[0];
      const b = JSON.parse(init.body);
      const fail = (message) => new Response(JSON.stringify({ error: { message } }), { status: 400 });
      const ok = (o = {}) => new Response(JSON.stringify(o));
      if (method === "signUp") { if (users.has(b.email)) return fail("EMAIL_EXISTS"); users.set(b.email, { pw: b.password, verified: false }); return ok({ idToken: "tok:" + b.email }); }
      if (method === "signInWithPassword") { const u = users.get(b.email); return u && u.pw === b.password ? ok({ idToken: "tok:" + b.email }) : fail("INVALID_LOGIN_CREDENTIALS"); }
      const email = String(b.idToken).slice(4);
      if (method === "sendOobCode") { sent.push({ email, continueUrl: b.continueUrl }); return ok(); }
      if (method === "lookup") return ok({ users: [{ emailVerified: users.get(email).verified }] });
      if (method === "delete") { users.delete(email); deleted.push(email); return ok(); }
      return fail("UNKNOWN");
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("שליחה ⇐ הגולש לוחץ ⇐ בדיקה מסמנת מאומת, והמשתמש הזמני ב-Firebase נמחק", async () => {
    const r = await call("/auth/register", { body: { email: "real.person@example.com", password: PW } });
    expect((await call("/me", { token: r.data.token })).data.verifyAvailable).toBe(true);
    expect((await call("/account/verify/send", { token: r.data.token, body: {} })).data).toEqual({ sent: true });
    expect(sent).toEqual([{ email: "real.person@example.com", continueUrl: "https://hopetohelp.github.io/26/#/support" }]);
    // הסיסמה הזמנית אינה סיסמת האתר, ושמורה מוצפנת
    expect(users.get("real.person@example.com").pw).not.toBe(PW);
    expect(JSON.stringify(env.DB.raw.prepare("SELECT * FROM email_verify").all())).not.toContain(users.get("real.person@example.com").pw);
    expect((await call("/account/verify/check", { token: r.data.token, body: {} })).data).toEqual({ verified: false });
    users.get("real.person@example.com").verified = true; // הלחיצה על הקישור שבמייל
    expect((await call("/account/verify/check", { token: r.data.token, body: {} })).data).toEqual({ verified: true });
    expect((await call("/me", { token: r.data.token })).data.emails[0]).toMatchObject({ email: "real.person@example.com", verified: true });
    expect(deleted).toEqual(["real.person@example.com"]);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM email_verify").get().n).toBe(0);
    expect((await call("/account/verify/send", { token: r.data.token, body: {} })).data.error).toBe("nothing_to_verify");
  });

  it("שליחה חוזרת משתמשת באותו משתמש זמני; מוגבלת ל-3 בשעה; בלי מפתח Firebase — לא זמין", async () => {
    const r = await call("/auth/register", { body: { email: "again@example.com", password: PW } });
    for (let i = 0; i < 3; i++) expect((await call("/account/verify/send", { token: r.data.token, body: {} })).status).toBe(200);
    expect(sent).toHaveLength(3);
    expect(users.size).toBe(1);
    expect((await call("/account/verify/send", { token: r.data.token, body: {} })).status).toBe(429);
    delete env.FIREBASE_API_KEY;
    expect((await call("/account/verify/send", { token: r.data.token, body: {} })).data.error).toBe("verify_not_enabled");
  });

  it("חשבון Google מאומת כבר, ושליחה בלי מייל רשום — נדחות; בדיקה בלי שליחה קודמת — נדחית", async () => {
    const g = await call("/auth/google", { body: { credential: await google({}) } });
    expect((await call("/account/verify/send", { token: g.data.token, body: {} })).data.error).toBe("nothing_to_verify");
    expect((await call("/account/verify/check", { token: g.data.token, body: {} })).data).toEqual({ verified: true });
    const r = await call("/auth/register", { body: { email: "nosend@example.com", password: PW } });
    expect((await call("/account/verify/check", { token: r.data.token, body: {} })).data.error).toBe("not_sent");
  });

  it("Firebase חסום להרשמה במייל וסיסמה (לא הופעל) ⇐ הודעה ברורה; מחיקת חשבון מוחקת גם את המשתמש הזמני", async () => {
    const r = await call("/auth/register", { body: { email: "gone2@example.com", password: PW } });
    await call("/account/verify/send", { token: r.data.token, body: {} });
    expect(users.has("gone2@example.com")).toBe(true);
    await call("/delete", { token: r.data.token, body: { confirm: "מחק" } });
    expect(users.has("gone2@example.com")).toBe(false);
    const r2 = await call("/auth/register", { body: { email: "blocked@example.com", password: PW } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "OPERATION_NOT_ALLOWED" } }), { status: 400 })));
    expect((await call("/account/verify/send", { token: r2.data.token, body: {} })).data.error).toBe("verify_not_enabled");
  });
});
