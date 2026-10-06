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
    MAIL_FROM: "",
    IP_KEY: "ip-secret",
    LOOKUP_KEY: "lookup-secret",
    EMAIL_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
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
const newP = async (ip = ipFor()) => (await call("/participant", { body: {}, ip })).data.token;
let op = 0;
const save = (token, unit, payload, op_id = "op-" + String(op++).padStart(8, "0")) => call("/save", { token, body: { unit, op_id, registry: "r", payload } });

describe("participant & saves", () => {
  it("creates participant, /me, CORS with authorization header", async () => {
    const r = await call("/participant", { body: {} });
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-headers")).toContain("authorization");
    const me = await call("/me", { token: r.data.token });
    expect(me.data).toMatchObject({ latest: {}, username: null, hasEmail: false, google: false });
    expect((await call("/me")).status).toBe(401);
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
  it("rate limits: 20 saves/hour per participant, 5 participants/hour per IP", async () => {
    const tok = await newP();
    for (let i = 0; i < LIMITS.savesPerHour; i++) expect((await save(tok, "seats", seats(i))).status).toBe(200);
    expect((await save(tok, "seats", seats(1))).status).toBe(429);
    t += 2 * 3600 * 1000;
    expect((await save(tok, "seats", seats(1))).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await call("/participant", { body: {}, ip: "2001:db8:1:2:3::1" })).status).toBe(200);
    expect((await call("/participant", { body: {}, ip: "2001:db8:1:2:ffff::9" })).status).toBe(429); // אותו /64
    expect((await call("/participant", { body: {}, ip: "2001:db8:1:3::1" })).status).toBe(200);
  });
  it("IP_KEY_PREV keeps old counters", async () => {
    for (let i = 0; i < 5; i++) await call("/participant", { body: {}, ip: "9.9.9.9" });
    env.IP_KEY_PREV = env.IP_KEY;
    env.IP_KEY = "new-ip-secret";
    expect((await call("/participant", { body: {}, ip: "9.9.9.9" })).status).toBe(429);
  });
  it("link rotate invalidates old link; delete removes everything", async () => {
    const tok = await newP();
    await save(tok, "seats", seats(60));
    const r = await call("/link/rotate", { body: {}, token: tok });
    expect((await call("/me", { token: tok })).status).toBe(401);
    expect((await call("/me", { token: r.data.token })).status).toBe(200);
    expect((await call("/delete", { body: { confirm: "no" }, token: r.data.token })).status).toBe(400);
    expect((await call("/delete", { body: { confirm: "מחק" }, token: r.data.token })).data).toEqual({ ok: true });
    expect((await call("/me", { token: r.data.token })).status).toBe(401);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM versions").get().n).toBe(0);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM participants").get().n).toBe(0);
  });
  it("export returns participant data", async () => {
    const tok = await newP();
    await save(tok, "vote", { v2022: null, v2026: "private" });
    const e = await call("/export", { token: tok });
    expect(e.data.versions.length).toBe(1);
    expect(e.data.credentials[0].kind).toBe("link");
  });
});

describe("username & password", () => {
  it("register, login, wrong password, no enumeration, progressive delay", async () => {
    const anon = await newP();
    expect((await call("/auth/register", { body: { username: "דני", password: "short" }, token: anon })).data.error).toBe("weak_password");
    const reg = await call("/auth/register", { body: { username: "Dani_7", password: "a long pass phrase" }, token: anon });
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

describe("email verify + reset flow", () => {
  it("verifies email ownership, notifies old address, resets password once", async () => {
    env.RESEND_API_KEY = "re_test";
    env.MAIL_FROM = "site@example.org";
    const sent = [];
    vi.stubGlobal("fetch", async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response("{}", { status: 200 });
    });
    const tok = (await call("/auth/register", { body: { username: "mailer", password: "mail password 1" } })).data.token;
    await call("/auth/email", { body: { email: " A@Example.org " }, token: tok });
    expect((await call("/me", { token: tok })).data.hasEmail).toBe(false); // עד אימות
    const verify = /verify=([\w-]+)/.exec(sent.at(-1).body.html)[1];
    expect(sent.at(-1).body.to).toEqual(["a@example.org"]);
    expect((await call("/auth/email/verify", { body: { verify } })).data).toEqual({ ok: true });
    expect((await call("/me", { token: tok })).data.hasEmail).toBe(true);
    // החלפה ⇐ הודעה לכתובת הישנה
    await call("/auth/email", { body: { email: "b@example.org" }, token: tok });
    const v2 = /verify=([\w-]+)/.exec(sent.at(-1).body.html)[1];
    await call("/auth/email/verify", { body: { verify: v2 } });
    expect(sent.at(-1).body.to).toEqual(["a@example.org"]);
    // שכחתי סיסמה
    expect((await call("/auth/forgot", { body: { username: "nobody_here" } })).data).toEqual({ ok: true });
    const before = sent.length;
    await call("/auth/forgot", { body: { username: "mailer" } });
    const first = /reset=([\w-]+)/.exec(sent.at(-1).body.html)[1];
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1).body.to).toEqual(["b@example.org"]);
    expect(sent.at(-1).body.html).toContain('dir="rtl"');
    expect(sent.at(-1).body.html).toContain("https://hopetohelp.github.io/26/#/guess?reset=");
    await call("/auth/forgot", { body: { username: "mailer" } });
    const second = /reset=([\w-]+)/.exec(sent.at(-1).body.html)[1];
    expect((await call("/auth/reset", { body: { reset: first, password: "brand new pass 1" } })).status).toBe(400); // בוטל
    const ok = await call("/auth/reset", { body: { reset: second, password: "brand new pass 1" } });
    expect(ok.status).toBe(200);
    expect((await call("/me", { token: tok })).status).toBe(401); // כל הסשנים בוטלו
    expect((await call("/auth/reset", { body: { reset: second, password: "brand new pass 2" } })).status).toBe(400); // חד-פעמי
    t += 31 * 60 * 1000;
    await call("/auth/forgot", { body: { username: "mailer" } });
    const late = /reset=([\w-]+)/.exec(sent.at(-1).body.html)[1];
    t += 31 * 60 * 1000;
    expect((await call("/auth/reset", { body: { reset: late, password: "brand new pass 3" } })).status).toBe(400); // פג תוקף
    const row = env.DB.raw.prepare("SELECT ciphertext, lookup_hmac FROM recovery_emails").get();
    expect(row.ciphertext).not.toContain("example");
  }, 30000);
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
  it("dashboard closed at 29, open at 30, cached", async () => {
    await crowd(29);
    t += 3600 * 1000;
    await cron();
    let d = await call("/dashboard");
    expect(d.data.open).toBe(false);
    expect(d.headers.get("cache-control")).toBe("public, max-age=300");
    await crowd(1);
    t += 3600 * 1000;
    await cron();
    d = await call("/dashboard");
    expect(d.data).toMatchObject({ open: true, participants: 30 });
    expect(d.data.seats.n).toBe(30);
    expect(d.data.vote2026.all.likud).toEqual({ n: 14, of: 30 });
    expect(d.data.vote2026.all.yashar).toEqual({ n: 16, of: 30 });
    expect(d.data.matrix.rows["מחל"].n).toBe(30);
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
