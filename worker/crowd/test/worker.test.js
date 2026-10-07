import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker, { LIMITS } from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { seats, IDS } from "./helpers.js";
import { sha256 } from "../lib/crypto.js";

let env;
let t;
let ipN = 0;
const ipFor = () => `10.0.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
beforeEach(() => {
  t = Date.parse("2026-10-05T10:05:00Z");
  env = {
    DB: fakeD1(),
    ALLOWED_ORIGIN: "https://hopetohelp.github.io",
    SITE_URL: "https://hopetohelp.github.io/26/",
    IP_KEY: "ip-secret",
    NOW: () => t,
  };
});
afterEach(() => vi.unstubAllGlobals());

async function call(path, { body, token, method, ip = "1.2.3.4" } = {}) {
  const res = await worker.fetch(
    new Request("https://w.example" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", "cf-connecting-ip": ip, origin: "https://hopetohelp.github.io", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
}
let un = 0;
const PW = "a long pass phrase";
const register = (ip = ipFor(), username = "user_" + un++) => call("/auth/register", { body: { username, password: PW }, ip });
/** משתתף חדש = הרשמה (אין משתתף אנונימי). מחזיר אסימון סשן */
const newP = async (ip = ipFor()) => (await register(ip)).data.token;
let op = 0;
const save = (token, unit, payload, op_id = "op-" + String(op++).padStart(8, "0")) => call("/save", { token, body: { unit, op_id, registry: "r", payload } });

describe("participant & saves", () => {
  it("register creates participant + link; /me, CORS; no anonymous creation", async () => {
    const r = await register();
    expect(r.status).toBe(200);
    expect(r.data.token).toMatch(/^[\w-]{20,}$/);
    expect(r.data.link).toMatch(/^[\w-]{20,}$/);
    expect(r.headers.get("access-control-allow-headers")).toContain("authorization");
    const me = await call("/me", { token: r.data.token });
    expect(me.data).toMatchObject({ latest: {}, username: "user_" + (un - 1), google: false });
    expect((await call("/me")).status).toBe(401);
    expect((await call("/participant", { body: {} })).status).toBe(404);
    // הקישור אינו אסימון כניסה
    expect((await call("/me", { token: r.data.link })).status).toBe(401);
    expect((await save(r.data.link, "seats", seats(60))).status).toBe(401);
    expect((await call("/link/rotate", { body: {}, token: r.data.link })).status).toBe(401);
  });
  it("saves each unit; rejects invalid; op_id idempotent; history", async () => {
    const tok = await newP();
    expect((await save(tok, "vote", { v2022: "מחל", v2026: "likud" })).status).toBe(200);
    expect((await save(tok, "vote", { v2022: "xx", v2026: null })).status).toBe(400);
    expect((await save(tok, "seats", seats(60))).status).toBe(200);
    const bad = seats(60);
    bad.seats[IDS[0]].v = 50;
    expect((await save(tok, "seats", bad)).data).toMatchObject({ error: "invalid", field: "sum" });
    const blocs = { mode: "gov37", blocs: [{ id: "gov", name: "א", lists: [IDS[0]], target: 60 }, { id: "rest", name: "ב", lists: [], target: 60 }] };
    expect((await save(tok, "blocs", blocs)).status).toBe(200);
    expect((await save(tok, "blocs", { ...blocs, blocs: [{ ...blocs.blocs[0], target: 70 }, blocs.blocs[1]] })).status).toBe(400);
    const a = await save(tok, "seats", seats(30), "same-op-123");
    const b = await save(tok, "seats", seats(90), "same-op-123");
    expect(b.data.version.id).toBe(a.data.version.id);
    expect(b.data.version.payload.seats[IDS[0]].v).toBe(30);
    const h = await call("/history?unit=seats", { token: tok });
    expect(h.data.versions.length).toBe(2);
    const me = await call("/me", { token: tok });
    expect(Object.keys(me.data.latest).sort()).toEqual(["blocs", "seats", "vote"]);
  });
  it("rate limits: 20 saves/hour per participant, 5 registrations/hour per IP", async () => {
    const tok = await newP();
    for (let i = 0; i < LIMITS.savesPerHour; i++) expect((await save(tok, "seats", seats(i))).status).toBe(200);
    expect((await save(tok, "seats", seats(1))).status).toBe(429);
    t += 2 * 3600 * 1000;
    expect((await save(tok, "seats", seats(1))).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await register("2001:db8:1:2:3::1")).status).toBe(200);
    expect((await register("2001:db8:1:2:ffff::9")).status).toBe(429); // אותו /64
    expect((await register("2001:db8:1:3::1")).status).toBe(200);
  });
  it("IP_KEY_PREV keeps old counters", async () => {
    for (let i = 0; i < 5; i++) await register("9.9.9.9");
    env.IP_KEY_PREV = env.IP_KEY;
    env.IP_KEY = "new-ip-secret";
    expect((await register("9.9.9.9")).status).toBe(429);
  });
  it("link rotate (session only) replaces the recovery link; delete removes everything", async () => {
    const reg = await register();
    const tok = reg.data.token;
    await save(tok, "seats", seats(60));
    const r = await call("/link/rotate", { body: {}, token: tok });
    expect(r.data.link).toMatch(/^[\w-]{20,}$/);
    expect((await call("/me", { token: tok })).status).toBe(200); // הסשן נשאר
    expect((await call("/auth/recover", { body: { link: reg.data.link, password: "brand new pass 1" } })).status).toBe(401);
    expect((await call("/auth/recover", { body: { link: r.data.link, password: "brand new pass 1" }, ip: "7.7.7.1" })).status).toBe(200);
    const tok2 = (await call("/auth/login", { body: { username: "user_" + (un - 1), password: "brand new pass 1" } })).data.token;
    expect((await call("/delete", { body: { confirm: "no" }, token: tok2 })).status).toBe(400);
    expect((await call("/delete", { body: { confirm: "מחק" }, token: tok2 })).data).toEqual({ ok: true });
    expect((await call("/me", { token: tok2 })).status).toBe(401);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM versions").get().n).toBe(0);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM participants").get().n).toBe(0);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM credentials").get().n).toBe(0);
  }, 20000);
  it("export returns participant data", async () => {
    const tok = await newP();
    await save(tok, "vote", { v2022: null, v2026: "private" });
    const e = await call("/export", { token: tok });
    expect(e.data.versions.length).toBe(1);
    expect(e.data.credentials.map((c) => c.kind).sort()).toEqual(["link", "password"]);
  });
});

describe("username & password", () => {
  it("register, login, wrong password, no enumeration, progressive delay", async () => {
    expect((await call("/auth/register", { body: { username: "דני", password: "short" } })).data.error).toBe("weak_password");
    expect((await call("/auth/register", { body: { username: "x", password: "a long pass phrase" } })).data.error).toBe("bad_username");
    const reg = await call("/auth/register", { body: { username: "Dani_7", password: "a long pass phrase" } });
    expect(reg.status).toBe(200);
    expect((await call("/me", { token: reg.data.token })).data.username).toBe("Dani_7");
    expect((await call("/auth/register", { body: { username: "dani_7", password: "a long pass phrase" } })).status).toBe(409);
    expect((await call("/auth/login", { body: { username: "DANI_7", password: "a long pass phrase" } })).status).toBe(200);
    const wrong = await call("/auth/login", { body: { username: "dani_7", password: "wrong wrong wrong" }, ip: "5.5.5.5" });
    const ghost = await call("/auth/login", { body: { username: "ghost_user", password: "wrong wrong wrong" }, ip: "5.5.5.6" });
    expect(wrong).toMatchObject({ status: 401, data: { error: "bad_credentials" } });
    expect(ghost).toMatchObject({ status: 401, data: { error: "bad_credentials" } });
    for (let i = 0; i < 2; i++) await call("/auth/login", { body: { username: "dani_7", password: "nope nope nope" }, ip: "5.5.5.7" });
    const slow = await call("/auth/login", { body: { username: "dani_7", password: "a long pass phrase" }, ip: "5.5.5.8" });
    expect(slow.status).toBe(429);
    expect(slow.data.error).toBe("slow_down");
    t += 5000;
    expect((await call("/auth/login", { body: { username: "dani_7", password: "a long pass phrase" }, ip: "5.5.5.8" })).status).toBe(200);
  }, 20000);
  it("password change revokes other sessions; logout all", async () => {
    const reg = await call("/auth/register", { body: { username: "user_a", password: "first password!" } });
    const s2 = (await call("/auth/login", { body: { username: "user_a", password: "first password!" } })).data.token;
    const ch = await call("/auth/password", { body: { current: "first password!", next: "second password!" }, token: reg.data.token });
    expect(ch.status).toBe(200);
    expect((await call("/me", { token: s2 })).status).toBe(401);
    expect((await call("/me", { token: reg.data.token })).status).toBe(401);
    expect((await call("/me", { token: ch.data.token })).status).toBe(200);
    const s3 = (await call("/auth/login", { body: { username: "user_a", password: "second password!" } })).data.token;
    await call("/auth/logout", { body: { all: true }, token: s3 });
    expect((await call("/me", { token: ch.data.token })).status).toBe(401);
  }, 20000);
  it("upgrades lower iteration count on login", async () => {
    await call("/auth/register", { body: { username: "olduser", password: "old password 1" } });
    const { hashPassword } = await import("../lib/crypto.js");
    const h = await hashPassword("old password 1", 1000);
    env.DB.raw.prepare("UPDATE credentials SET hash = ?, salt = ?, iterations = 1000 WHERE username_norm = 'olduser'").run(h.hash, h.salt);
    expect((await call("/auth/login", { body: { username: "olduser", password: "old password 1" } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT iterations FROM credentials WHERE username_norm = 'olduser'").get().iterations).toBe(100000);
  }, 20000);
});

describe("recovery via personal link (no email)", () => {
  it("/auth/recover sets a new password with the link; revokes sessions, keeps the link", async () => {
    const reg = await call("/auth/register", { body: { username: "forgetful", password: "original pass 1" } });
    expect(reg.status).toBe(200);
    const link = reg.data.link;
    const other = (await call("/auth/login", { body: { username: "forgetful", password: "original pass 1" } })).data.token;
    expect((await call("/auth/recover", { body: { link, password: "short" } })).data.error).toBe("weak_password");
    const ch = await call("/auth/recover", { body: { link, password: "recovered pass 1" } });
    expect(ch.status).toBe(200);
    expect(ch.data.username).toBe("forgetful");
    expect((await call("/me", { token: reg.data.token })).status).toBe(401);
    expect((await call("/me", { token: other })).status).toBe(401);
    expect((await call("/me", { token: ch.data.token })).status).toBe(200);
    expect((await call("/auth/login", { body: { username: "forgetful", password: "original pass 1" } })).status).toBe(401);
    expect((await call("/auth/login", { body: { username: "forgetful", password: "recovered pass 1" } })).status).toBe(200);
    // הקישור נשאר — אפשר לשחזר שוב
    expect((await call("/auth/recover", { body: { link, password: "recovered pass 2" } })).status).toBe(200);
  }, 30000);
  it("/auth/link logs in with the link (normal session); link itself is not a Bearer", async () => {
    const reg = await call("/auth/register", { body: { username: "linker", password: "original pass 3" } });
    const r = await call("/auth/link", { body: { link: reg.data.link }, ip: "8.8.8.1" });
    expect(r.status).toBe(200);
    expect(r.data.username).toBe("linker");
    expect((await call("/me", { token: r.data.token })).data.username).toBe("linker");
    expect((await call("/me", { token: reg.data.link })).status).toBe(401);
    expect((await call("/me", { token: reg.data.token })).status).toBe(200); // סשנים אחרים לא נפגעים
    for (let i = 0; i < 3; i++) await call("/auth/link", { body: { link: "y".repeat(43) }, ip: "8.8.8.2" });
    expect((await call("/auth/link", { body: { link: reg.data.link }, ip: "8.8.8.2" })).status).toBe(429);
  }, 20000);
  it("bad links are rejected with progressive delay", async () => {
    const bogus = "x".repeat(43);
    for (let i = 0; i < 3; i++) expect((await call("/auth/recover", { body: { link: bogus, password: "whatever pass 1" }, ip: "6.6.6.6" })).status).toBe(401);
    const slow = await call("/auth/recover", { body: { link: bogus, password: "whatever pass 1" }, ip: "6.6.6.6" });
    expect(slow).toMatchObject({ status: 429, data: { error: "slow_down" } });
    expect((await call("/auth/recover", { body: { password: "whatever pass 1" }, ip: "6.6.6.7" })).status).toBe(401);
  });
  it("password change with a session always requires the current password", async () => {
    const reg = await call("/auth/register", { body: { username: "session_user", password: "original pass 2" } });
    const r = await call("/auth/password", { body: { next: "another pass 22" }, token: reg.data.token });
    expect(r).toMatchObject({ status: 401, data: { error: "bad_credentials" } });
    const w = await call("/auth/password", { body: { current: "wrong pass 222", next: "another pass 22" }, token: reg.data.token });
    expect(w.status).toBe(401);
    // הקישור אינו Bearer גם כאן
    expect((await call("/auth/password", { body: { next: "another pass 22" }, token: reg.data.link })).status).toBe(401);
    expect((await call("/auth/login", { body: { username: "session_user", password: "original pass 2" } })).status).toBe(200);
  }, 30000);
  it("removed email endpoints are gone", async () => {
    for (const p of ["/auth/email", "/auth/email/verify", "/auth/forgot", "/auth/reset"]) expect((await call(p, { body: {} })).status).toBe(404);
  });
});

describe("cron: aggregation & anomaly", () => {
  const cron = () => worker.scheduled({}, env, { waitUntil: () => {} });
  async function crowd(n, payloadFn = (i) => seats(40 + (i % 20))) {
    for (let i = 0; i < n; i++) {
      const tok = await newP();
      await save(tok, "seats", payloadFn(i));
      await save(tok, "vote", { v2022: "מחל", v2026: i % 2 ? "likud" : "yashar" });
    }
  }
  it.each([{ open: false }, { open: true, policy: "open-all-v1" }])("refreshes an old snapshot once on the first request: %j", async (old) => {
    await crowd(1);
    await env.DB.prepare("INSERT INTO aggregates (aggregation_id, published_at, section, json) VALUES (?, ?, ?, ?)")
      .bind("old", new Date(t).toISOString(), "dashboard", JSON.stringify({ ...old, participants: 1 })).run();
    const first = await call("/dashboard");
    expect(first.data).toMatchObject({ open: true, policy: "open-all-v2", participants: 1 });
    expect(first.data.seats.n).toBe(1);
    expect(first.data.matrix.rows["מחל"].n).toBe(1);
    const before = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM aggregates").get().n;
    const second = await call("/dashboard");
    expect(second.data).toEqual(first.data);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM aggregates").get().n).toBe(before);
  });
  it("dashboard open below 30 without stale caching", async () => {
    await crowd(29);
    t += 3600 * 1000;
    await cron();
    let d = await call("/dashboard");
    expect(d.data.open).toBe(true);
    expect(d.headers.get("cache-control")).toBe("no-store");
    await crowd(1);
    t += 3600 * 1000;
    await cron();
    d = await call("/dashboard");
    expect(d.data).toMatchObject({ open: true, participants: 30 });
    expect(d.data.seats.n).toBe(30);
    expect(d.data.vote2026.all.likud).toEqual({ n: 14, of: 30 });
    expect(d.data.vote2026.all.yashar).toEqual({ n: 16, of: 30 });
    expect(d.data.matrix.rows["מחל"].n).toBe(29); // הפילוח היומי נשאר בתמונת הפרסום הראשונה
  }, 30000);
  it("surge hour flags newcomers for review and logs it", async () => {
    await crowd(30, () => seats(77));
    t += 3600 * 1000;
    await cron();
    const log = await call("/log");
    expect(log.data.entries.length).toBe(1);
    expect(log.data.entries[0]).toMatchObject({ participants: 30, decision: "pending" });
    const d = await call("/dashboard");
    expect(d.data.participants).toBe(0);
    expect(d.data.underReview.participants).toBe(30);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM participants WHERE review = 1").get().n).toBe(30);
  }, 30000);
  it("cron deletes rate rows older than 24h", async () => {
    await newP();
    t += 25 * 3600 * 1000;
    await cron();
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM rate").get().n).toBe(0);
  });
});
