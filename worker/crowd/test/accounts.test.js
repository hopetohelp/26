import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from "vitest";
import worker, { cleanup } from "../index.js";
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
  it("אורח ישן: needsEmail ו-legacy, ממשיך לשמור; הוספת מייל וסיסמה בלי קישור אישי חדש", async () => {
    const t = await legacy();
    expect((await call("/me", { token: t })).data).toMatchObject({ needsEmail: true, guest: true, legacy: true });
    expect((await save(t)).status).toBe(200);
    expect((await call("/auth/claim", { token: t, body: { email: "late@example.com", password: "short" } })).data.error).toBe("weak_password");
    const c = await call("/auth/claim", { token: t, body: { email: "late@example.com", password: PW } });
    expect(c.data).toMatchObject({ email: "late@example.com" });
    expect(c.data.link).toBeUndefined();
    const me = (await call("/me", { token: t })).data;
    expect(me).toMatchObject({ needsEmail: false, hasPassword: true });
    expect(me.latest.seats).toBeTruthy();
    expect((await call("/auth/login", { body: { email: "late@example.com", password: PW } })).status).toBe(200);
  });

  it("שם משתמש ישן וקישור ישן: עד האימות נכנסים בשניהם; אחרי האימות שניהם נמחקים והשם נשמר כשם תצוגה", async () => {
    const t = await legacy({ username: "old_timer" });
    const id = env.DB.raw.prepare("SELECT participant FROM sessions WHERE token_hash = ?").get(await sha256(t)).participant;
    const link = "K".repeat(12) + "linklinklinklinklinklink";
    env.DB.raw.prepare("INSERT INTO credentials (participant, kind, token_hash, created_at) VALUES (?, 'link', ?, ?)").run(id, await sha256(link), "x");
    expect((await call("/auth/claim", { token: t, body: { email: "timer@example.com" } })).status).toBe(200);
    expect((await call("/me", { token: t })).data).toMatchObject({ legacy: true, verified: false, username: "old_timer" });
    expect((await call("/auth/link", { body: { link } })).status).toBe(200);
    expect((await call("/auth/login", { body: { username: "old_timer", password: PW } })).status).toBe(200);
    env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = ?").run(id); // המייל אומת
    expect((await call("/me", { token: t })).data).toMatchObject({ legacy: false, verified: true, username: null, name: "old_timer" });
    expect((await call("/auth/link", { body: { link } })).status).toBe(401);
    expect((await call("/auth/login", { body: { username: "old_timer", password: PW } })).status).toBe(401);
    expect((await call("/auth/login", { body: { email: "timer@example.com", password: PW } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM credentials WHERE kind = 'link'").get().n).toBe(0);
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


describe("מחיקת ההשערות", () => {
  it("מוחק את כל הגרסאות ומשאיר את החשבון", async () => {
    const r = await call("/auth/register", { body: { email: "clear@example.com", password: PW } });
    expect((await call("/save", { token: r.data.token, body: { unit: "seats", op_id: "op-clear-1", registry: "x", payload: seats() } })).status).toBe(200);
    expect((await call("/history/clear", { token: r.data.token, body: {} })).status).toBe(400);
    expect((await call("/history/clear", { token: r.data.token, body: { confirm: "מחק" } })).status).toBe(200);
    expect((await call("/history?unit=seats", { token: r.data.token })).data.versions).toHaveLength(0);
    expect((await call("/me", { token: r.data.token })).status).toBe(200);
  });
});

describe("ההשערה האחרונה של כל יום", () => {
  it("בכל יחידה נשארת רק האחרונה בכל יום (שעון ישראל); יחידות ומשתתפים אחרים לא נפגעים", async () => {
    const a = await call("/auth/register", { body: { email: "daily-a@example.com", password: PW } });
    const b = await call("/auth/register", { body: { email: "daily-b@example.com", password: PW } });
    const at = (iso) => { env.NOW = () => Date.parse(iso); };
    const put = (token, unit, op, n) => call("/save", { token, body: { unit, op_id: op, registry: "r", payload: unit === "seats" ? seats(n) : { v2022: null, v2026: "likud" } } });
    at("2026-10-08T08:00:00Z"); await put(a.data.token, "seats", "op-day1-aaaa1", 50); await put(b.data.token, "seats", "op-day1-bbbb1", 50);
    at("2026-10-08T09:00:00Z"); await put(a.data.token, "seats", "op-day1-aaaa2", 55); await put(a.data.token, "vote", "op-day1-vote1", 0);
    at("2026-10-08T20:30:00Z"); await put(a.data.token, "seats", "op-day1-aaaa3", 60);
    // 21:30 UTC = 00:30 למחרת בישראל — יום חדש, הקודמת נשארת
    at("2026-10-08T21:30:00Z"); await put(a.data.token, "seats", "op-day2-aaaa4", 70);
    at("2026-10-08T21:45:00Z"); await put(a.data.token, "seats", "op-day2-aaaa5", 80);
    const mine = (await call("/history?unit=seats", { token: a.data.token })).data.versions;
    expect(mine.map((v) => v.payload.seats[Object.keys(v.payload.seats)[0]].v).sort()).toEqual([60, 80]);
    expect((await call("/history?unit=vote", { token: a.data.token })).data.versions).toHaveLength(1);
    expect((await call("/history?unit=seats", { token: b.data.token })).data.versions).toHaveLength(1);
    // ניסיון חוזר של שמירה אחרונה אינו יוצר גרסה
    await put(a.data.token, "seats", "op-day2-aaaa5", 80);
    expect((await call("/history?unit=seats", { token: a.data.token })).data.versions).toHaveLength(2);
  });
});

describe("פעילות משתתף בממשק הניהול", () => {
  it("הצבעה שמורה, סך שמירות (כולל שנמחקו באותו יום), הרשמה וכניסות — גם אחרי ניקוי סשנים", async () => {
    env.DB.raw.prepare("INSERT INTO admin_keys (hash,created_at) VALUES (?,?)").run(await sha256("k".repeat(40)), "2026-10-01");
    const adminGet = async () => (await worker.fetch(new Request("https://w.example/admin/guesses", { headers: { origin: env.ALLOWED_ORIGIN, "x-admin-key": "k".repeat(40), "cf-connecting-ip": "8.8.8.8" } }), env)).json();
    const at = (iso) => { env.NOW = () => Date.parse(iso); };
    at("2026-10-08T08:00:00Z");
    const reg = await call("/auth/register", { body: { email: "act@example.com", password: PW } });
    const put = (unit, op, n) => call("/save", { token: reg.data.token, body: { unit, op_id: op, registry: "r", payload: unit === "seats" ? seats(n) : { v2022: null, v2026: "likud" } } });
    await put("seats", "op-act-0000001", 50);
    await put("seats", "op-act-0000002", 60);
    await put("vote", "op-act-0000003", 0);
    at("2026-10-08T09:00:00Z");
    await call("/auth/login", { body: { email: "act@example.com", password: PW } });
    let row = (await adminGet()).rows.find((r) => r.registered === "2026-10-08T08:00:00.000Z");
    expect(row).toMatchObject({ hasVote: true, saves: 3, logins: 2, lastLogin: "2026-10-08T09:00:00.000Z" });
    // ניקוי הסשנים אחרי שפגו: הכניסות לא אובדות
    await cleanup(env, Date.parse("2026-12-30T00:00:00Z"));
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM sessions").get().n).toBe(0);
    row = (await adminGet()).rows.find((r) => r.registered === "2026-10-08T08:00:00.000Z");
    expect(row).toMatchObject({ logins: 2, lastLogin: "2026-10-08T09:00:00.000Z", saves: 3 });
  });
});

/** אימות מייל דרך Firebase (הכרעת בעלים 9.10.2026) — Firebase מדומה: משתמשים לפי מייל, שליחת מייל וסימון אימות */
describe("אימות מייל", () => {
  let users, sent, deleted, codes;
  beforeEach(() => {
    users = new Map(); sent = []; deleted = []; codes = new Map();
    env.FIREBASE_API_KEY = "test-key";
    env.SITE_URL = "https://hopetohelp.github.io/26/";
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const method = String(url).split("accounts:")[1].split("?")[0];
      const b = JSON.parse(init.body);
      const fail = (message) => new Response(JSON.stringify({ error: { message } }), { status: 400 });
      const ok = (o = {}) => new Response(JSON.stringify(o));
      if (method === "signUp") { if (users.has(b.email)) return fail("EMAIL_EXISTS"); users.set(b.email, { pw: b.password, verified: false }); return ok({ idToken: "tok:" + b.email }); }
      if (method === "signInWithPassword") { const u = users.get(b.email); return u && u.pw === b.password ? ok({ idToken: "tok:" + b.email }) : fail("INVALID_LOGIN_CREDENTIALS"); }
      // קוד מהקישור שבמייל (תווים כמו בקוד אמיתי): הטבלה codes ממפה קוד ⇐ {email, type, expired}
      if (method === "resetPassword" || method === "update") {
        const c = codes.get(String(b.oobCode));
        if (!c || !users.has(c.email)) return fail("INVALID_OOB_CODE");
        if (c.expired) return fail("EXPIRED_OOB_CODE");
        if (method === "update") users.get(c.email).verified = true;
        return ok({ email: c.email, requestType: c.type });
      }
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

  it("דף האימות באתר: הקוד מהקישור מאמת בלי סשן (גם ממכשיר אחר), המשתמש הזמני נמחק, וקוד לא תקף נדחה", async () => {
    const r = await call("/auth/register", { body: { email: "page.user@example.com", password: PW } });
    await call("/account/verify/send", { token: r.data.token, body: {} });
    codes.set("OTHERtypeCODE1234567890", { email: "page.user@example.com", type: "PASSWORD_RESET" });
    codes.set("EXPIREDcode1234567890", { email: "page.user@example.com", type: "VERIFY_EMAIL", expired: true });
    codes.set("GOODcodeABCDEFGH1234567890", { email: "page.user@example.com", type: "VERIFY_EMAIL" });
    expect((await call("/auth/verify-email", { body: { oobCode: "unknownCODE1234567890" } })).data.error).toBe("bad_code");
    expect((await call("/auth/verify-email", { body: { oobCode: "OTHERtypeCODE1234567890" } })).data.error).toBe("bad_code"); // לא קוד אימות מייל
    expect((await call("/auth/verify-email", { body: { oobCode: "EXPIREDcode1234567890" } })).data.error).toBe("expired_code");
    expect((await call("/auth/verify-email", { body: { oobCode: "x" } })).data.error).toBe("bad_code");
    expect((await call("/me", { token: r.data.token })).data.emails[0].verified).toBe(false);
    expect((await call("/auth/verify-email", { body: { oobCode: "GOODcodeABCDEFGH1234567890" } })).data).toEqual({ verified: true, account: true });
    expect((await call("/me", { token: r.data.token })).data.emails[0].verified).toBe(true);
    expect(deleted).toContain("page.user@example.com");
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM email_verify").get().n).toBe(0);
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

  /** חשבון עם מייל מאומת וסיסמה (המצב שבו איפוס מותר) */
  async function verifiedAccount(email) {
    const r = await call("/auth/register", { body: { email, password: PW } });
    const id = (await call("/me", { token: r.data.token })).data.participant;
    env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = ?").run(id);
    return { ...r.data, id };
  }
  const secretOf = (i = sent.length - 1) => new URL(sent[i].continueUrl).searchParams.get("reset");

  it("איפוס סיסמה: מייל עם סוד בכתובת החזרה ⇐ סיסמה חדשה ⇐ כניסה; הסוד חד-פעמי, הישנה לא עובדת, שאר הסשנים מבוטלים", async () => {
    const acc = await verifiedAccount("forgot@example.com");
    expect((await call("/auth/forgot", { body: { email: "Forgot@Example.com" } })).data).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].email).toBe("forgot@example.com");
    expect(sent[0].continueUrl).toMatch(/^https:\/\/hopetohelp\.github\.io\/26\/\?reset=[\w-]{20,}$/);
    // רק גיבוב הסוד נשמר, והסיסמה הזמנית ב-Firebase אינה סיסמת האתר
    expect(JSON.stringify(env.DB.raw.prepare("SELECT * FROM password_reset").all())).not.toContain(secretOf());
    expect(users.get("forgot@example.com").pw).not.toBe(PW);
    const NEW = "brand new password 9";
    expect((await call("/auth/reset", { body: { secret: secretOf(), password: "short" } })).data.error).toBe("weak_password");
    const done = await call("/auth/reset", { body: { secret: secretOf(), password: NEW } });
    expect(done.status).toBe(200);
    expect((await call("/me", { token: done.data.token })).data.participant).toBe(acc.id);
    expect((await call("/me", { token: acc.token })).status).toBe(401); // הסשן הקודם בוטל
    expect((await call("/auth/login", { body: { email: "forgot@example.com", password: PW } })).status).toBe(401);
    expect((await call("/auth/login", { body: { email: "forgot@example.com", password: NEW } })).status).toBe(200);
    // חד-פעמי, והמשתמש הזמני ב-Firebase נמחק
    expect((await call("/auth/reset", { body: { secret: secretOf(), password: "another pass 22" } })).data.error).toBe("bad_reset");
    expect(users.has("forgot@example.com")).toBe(false);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM password_reset").get().n).toBe(0);
  });

  it("אותה תשובה לכתובת לא רשומה ולחשבון Google בלבד — ובלי שום מייל", async () => {
    await call("/auth/google", { body: { credential: await google({ email: "only.google@gmail.com" }) } });
    for (const email of ["nobody@example.com", "only.google@gmail.com"]) {
      expect((await call("/auth/forgot", { body: { email } })).data).toEqual({ sent: true });
    }
    expect(sent).toHaveLength(0);
    expect(users.size).toBe(0);
    expect((await call("/auth/forgot", { body: { email: "not-an-email" } })).data.error).toBe("email_required");
  });

  it("מייל שעוד לא אומת: האיפוס עובד ומסמן אותו מאומת (פתיחת המייל מוכיחה בעלות)", async () => {
    const r = await call("/auth/register", { body: { email: "unverified.forgot@example.com", password: PW } });
    expect((await call("/auth/forgot", { body: { email: "unverified.forgot@example.com" } })).data).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    const done = await call("/auth/reset", { body: { secret: secretOf(), password: "brand new password 9" } });
    expect(done.status).toBe(200);
    expect((await call("/me", { token: done.data.token })).data).toMatchObject({ verified: true, emails: [{ email: "unverified.forgot@example.com", verified: true }] });
    expect((await call("/me", { token: r.data.token })).status).toBe(401);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM password_reset_email").get().n).toBe(0);
  });

  it("בקשה חדשה מבטלת את הקודמת (ומשתמש זמני חדש); סוד שגוי או שפג תוקפו נדחה", async () => {
    await verifiedAccount("twice@example.com");
    await call("/auth/forgot", { body: { email: "twice@example.com" } });
    const first = secretOf();
    users.get("twice@example.com").verified = true; // מישהו כבר לחץ על הקישור הראשון
    await call("/auth/forgot", { body: { email: "twice@example.com" } });
    expect(users.get("twice@example.com").verified).toBe(false);
    expect(secretOf()).not.toBe(first);
    expect((await call("/auth/reset", { body: { secret: first, password: "brand new password 9" } })).data.error).toBe("bad_reset");
    expect((await call("/auth/reset", { body: { secret: "x", password: "brand new password 9" } })).data.error).toBe("bad_reset");
    const NOW = env.NOW;
    env.NOW = () => NOW() + 31 * 60 * 1000;
    expect((await call("/auth/reset", { body: { secret: secretOf(), password: "brand new password 9" } })).data.error).toBe("bad_reset");
    env.NOW = NOW;
    expect((await call("/auth/reset", { body: { secret: secretOf(), password: "brand new password 9" } })).status).toBe(200);
  });

  it("הגבלות: 3 מיילים ביום לכתובת (בלי חשיפה), ובלי מפתח Firebase — לא זמין", async () => {
    await verifiedAccount("limited@example.com");
    for (let i = 0; i < 5; i++) expect((await call("/auth/forgot", { body: { email: "limited@example.com" } })).data).toEqual({ sent: true });
    expect(sent).toHaveLength(3);
    delete env.FIREBASE_API_KEY;
    expect((await call("/auth/forgot", { body: { email: "limited@example.com" } })).data.error).toBe("verify_not_enabled");
  });

  it("Firebase דחה את כתובת החזרה ⇐ שגיאה ולא מייל בלי סוד", async () => {
    await verifiedAccount("nocontinue@example.com");
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => (String(url).includes("sendOobCode") ? new Response(JSON.stringify({ error: { message: "INVALID_CONTINUE_URI" } }), { status: 400 }) : inner(url, init))));
    expect((await call("/auth/forgot", { body: { email: "nocontinue@example.com" } })).data.error).toBe("verify_failed");
    expect(sent).toHaveLength(0);
  });
});

describe("מנהל לפי חשבון ומספרי ניהול", () => {
  const asAdmin = (token, path = "/admin/whoami") => worker.fetch(new Request("https://w.example" + path, { headers: { "x-admin-key": token, origin: env.ALLOWED_ORIGIN } }), env).then(async (r) => ({ status: r.status, data: await r.json() }));
  it("רק חשבון שנמצא בטבלת admins נכנס; /me מסמן isAdmin; סשן רגיל וסשן שפג נדחים", async () => {
    const a = await call("/auth/register", { body: { email: "boss@example.com", password: PW } });
    const b = await call("/auth/register", { body: { email: "user@example.com", password: PW } });
    expect((await asAdmin(a.data.token)).status).toBe(401);
    expect((await call("/me", { token: a.data.token })).data.isAdmin).toBe(false);
    const id = (await call("/me", { token: a.data.token })).data.participant;
    env.DB.raw.prepare("INSERT INTO admins (participant, added_at) VALUES (?, ?)").run(id, "x");
    expect((await asAdmin(a.data.token)).data).toEqual({ ok: true });
    expect((await call("/me", { token: a.data.token })).data.isAdmin).toBe(true);
    expect((await asAdmin(b.data.token)).status).toBe(401);
    expect((await asAdmin(a.data.token, "/admin/support")).status).toBe(200);
    expect((await asAdmin(a.data.token, "/admin/guesses")).status).toBe(200);
    await call("/auth/logout", { token: a.data.token, body: {} });
    expect((await asAdmin(a.data.token)).status).toBe(401);
    expect((await asAdmin("short")).status).toBe(401);
  });

  it("מספרי הניהול: מייל מאומת בקישור (בלי אימות Google) וחשבונות Google", async () => {
    const KEY = "k".repeat(40);
    await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
    await call("/auth/register", { body: { email: "plain@example.com", password: PW } });
    const v = await call("/auth/register", { body: { email: "linked@example.com", password: PW } });
    const id = (await call("/me", { token: v.data.token })).data.participant;
    env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = ?").run(id);
    await call("/auth/google", { body: { credential: await google({}) } });
    const stats = (await asAdmin(KEY, "/admin/support")).data.stats;
    expect(stats).toMatchObject({ verifiedEmails: 1, googleAccounts: 1 });
  });
});

describe("סטטיסטיקות: כולם נספרים, עם הערה כמה מאומתים (הכרעת בעלים 9.10.2026)", () => {
  it("חשבון Google וחשבון במייל שלא אומת נספרים שניהם; ההערה: 1 מתוך 2 מאומתים", async () => {
    const g = await call("/auth/google", { body: { credential: await google({}) } });
    await save(g.data.token);
    const e = await call("/auth/register", { body: { email: "unverified@example.com", password: PW } });
    await save(e.data.token);
    const d = (await call("/dashboard")).data;
    expect(d.participants).toBe(2);
    expect(d.accounts).toEqual({ verified: 1, total: 2 });
  });
});
