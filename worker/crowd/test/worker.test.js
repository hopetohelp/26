import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker, { LIMITS, resetDashboardCache } from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { seats, IDS } from "./helpers.js";
import { sha256 } from "../lib/crypto.js";

let env;
let t;
let ipN = 0;
const ipFor = () => `10.0.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
beforeEach(() => {
  resetDashboardCache();
  t = Date.parse("2026-10-05T10:05:00Z");
  env = {
    DB: fakeD1(),
    ALLOWED_ORIGIN: "https://hopetohelp.github.io",
    SITE_URL: "https://hopetohelp.github.io/26/",
    IP_KEY: "ip-secret",
    DATA_KEY: "data-secret",
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
/** הרשמה במייל. כברירת מחדל המייל מסומן מאומת, כי רק חשבון מאומת נספר בסטטיסטיקות (הכרעת בעלים 9.10.2026) */
const register = async (ip = ipFor(), email = "user_" + un++ + "@example.com", { verified = true } = {}) => {
  const r = await call("/auth/register", { body: { email, password: PW }, ip });
  if (verified && r.status === 200) env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = (SELECT participant FROM sessions WHERE token_hash = ?)").run(await sha256(r.data.token));
  return r;
};
/** קישור אישי ישן (הונפק עד 10.10.2026; אין יותר הנפקה) — נוצר ישירות במאגר לחשבון של הסשן */
const giveLink = async (token) => {
  const link = "L".repeat(10) + Math.random().toString(36).slice(2).padEnd(30, "q");
  const s = env.DB.raw.prepare("SELECT participant FROM sessions WHERE token_hash = ?").get(await sha256(token));
  env.DB.raw.prepare("INSERT INTO credentials (participant, kind, token_hash, created_at) VALUES (?, 'link', ?, ?)").run(s.participant, await sha256(link), "2026-10-01T00:00:00Z");
  return link;
};
/** משתתף חדש = הרשמה (אין משתתף אנונימי). מחזיר אסימון סשן */
const newP = async (ip = ipFor()) => (await register(ip)).data.token;
let op = 0;
const save = (token, unit, payload, op_id = "op-" + String(op++).padStart(8, "0")) => call("/save", { token, body: { unit, op_id, registry: "r", payload } });

describe("participant & saves", () => {
  it("register creates participant (no personal link); /me, CORS; no anonymous creation", async () => {
    const r = await register(undefined, undefined, { verified: false });
    expect(r.status).toBe(200);
    expect(r.data.token).toMatch(/^[\w-]{20,}$/);
    expect(r.data.link).toBeUndefined();
    expect(r.headers.get("access-control-allow-headers")).toContain("authorization");
    const me = await call("/me", { token: r.data.token });
    expect(me.data).toMatchObject({ latest: {}, username: null, google: false, needsEmail: false, hasPassword: true, verified: false, legacy: false, emails: [{ email: "user_" + (un - 1) + "@example.com", source: "password", verified: false }] });
    expect((await call("/me")).status).toBe(401);
    expect((await call("/participant", { body: {} })).status).toBe(404);
    // אין יותר הנפקת קישורים (הכרעת בעלים 10.10.2026)
    expect((await call("/link/rotate", { body: {}, token: r.data.token })).status).toBe(410);
  });
  it("saves each unit; rejects invalid; op_id idempotent; history", async () => {
    const tok = await newP();
    expect((await save(tok, "vote", { v2022: "מחל", v2026: "likud" })).status).toBe(200);
    expect((await save(tok, "vote", { v2022: "xx", v2026: null })).status).toBe(400);
    expect((await save(tok, "seats", seats(60))).status).toBe(200);
    const bad = seats(60);
    bad.seats[IDS[0]].v = 50;
    expect((await save(tok, "seats", bad)).data).toMatchObject({ error: "invalid", field: "sum" });
    expect((await save(tok, "seats", seats(3))).data).toMatchObject({ error: "invalid", field: "threshold" });
    const blocs = { mode: "gov37", blocs: [{ id: "gov", name: "א", lists: [IDS[0]], target: 60 }, { id: "rest", name: "ב", lists: [], target: 60 }] };
    expect((await save(tok, "blocs", blocs)).status).toBe(200);
    expect((await save(tok, "blocs", { ...blocs, blocs: [{ ...blocs.blocs[0], target: 70 }, blocs.blocs[1]] })).status).toBe(200);
    t += 24 * 3600 * 1000; // יום אחר: ההשערה של היום הקודם נשארת (כלל "האחרונה של כל יום")
    const a = await save(tok, "seats", seats(30), "same-op-123");
    const b = await save(tok, "seats", seats(90), "same-op-123");
    expect(b.data.version.id).toBe(a.data.version.id);
    expect(b.data.version.payload.seats[IDS[0]].v).toBe(30);
    const h = await call("/history?unit=seats", { token: tok });
    expect(h.data.versions.length).toBe(2);
    const me = await call("/me", { token: tok });
    expect(Object.keys(me.data.latest).sort()).toEqual(["blocs", "seats", "vote"]);
  });
  it("rate limits: saves/hour per participant, 15 registrations/hour per IP", async () => {
    const tok = await newP();
    for (let i = 0; i < LIMITS.savesPerHour; i++) expect((await save(tok, "seats", seats((i % 16) + 4))).status).toBe(200);
    expect((await save(tok, "seats", seats(4))).status).toBe(429);
    t += 2 * 3600 * 1000;
    expect((await save(tok, "seats", seats(4))).status).toBe(200);
    for (let i = 0; i < LIMITS.participantsPerHourPerIp; i++) expect((await register("2001:db8:1:2:3::1")).status).toBe(200);
    expect((await register("2001:db8:1:2:ffff::9")).status).toBe(429); // אותו /64
    expect((await register("2001:db8:1:3::1")).status).toBe(200);
  });
  it("checking whether a username/email is taken counts toward the per-IP limit", async () => {
    expect((await register("8.8.4.4", "victim@example.com")).status).toBe(200);
    for (let i = 0; i < LIMITS.participantsPerHourPerIp; i++) expect((await register("8.8.8.8", "victim@example.com")).status).toBe(409);
    expect((await register("8.8.8.8", "victim@example.com")).status).toBe(429);
  });
  it("IP_KEY_PREV keeps old counters", async () => {
    for (let i = 0; i < LIMITS.participantsPerHourPerIp; i++) await register("9.9.9.9");
    env.IP_KEY_PREV = env.IP_KEY;
    env.IP_KEY = "new-ip-secret";
    expect((await register("9.9.9.9")).status).toBe(429);
  });
  it("delete removes everything", async () => {
    const reg = await register();
    const tok2 = reg.data.token;
    await save(tok2, "seats", seats(60));
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
    expect(e.data.credentials.map((c) => c.kind).sort()).toEqual(["password"]);
  });
});

describe("username & password", () => {
  it("register, login, wrong password, no enumeration, progressive delay", async () => {
    expect((await call("/auth/register", { body: { email: "דני@example.com", password: "short" } })).data.error).toBe("weak_password");
    expect((await call("/auth/register", { body: { username: "not_an_email", password: "a long pass phrase" } })).data.error).toBe("email_required");
    const reg = await call("/auth/register", { body: { email: "Dani_7@example.com", password: "a long pass phrase" } });
    expect(reg.status).toBe(200);
    expect((await call("/me", { token: reg.data.token })).data.emails[0].email).toBe("dani_7@example.com");
    expect((await call("/auth/register", { body: { email: "dani_7@example.com", password: "a long pass phrase" } })).status).toBe(409);
    expect((await call("/auth/login", { body: { email: "DANI_7@example.com", password: "a long pass phrase" } })).status).toBe(200);
    const wrong = await call("/auth/login", { body: { email: "dani_7@example.com", password: "wrong wrong wrong" }, ip: "5.5.5.5" });
    const ghost = await call("/auth/login", { body: { email: "ghost_user@example.com", password: "wrong wrong wrong" }, ip: "5.5.5.6" });
    expect(wrong).toMatchObject({ status: 401, data: { error: "bad_credentials" } });
    expect(ghost).toMatchObject({ status: 401, data: { error: "bad_credentials" } });
    for (let i = 0; i < 2; i++) await call("/auth/login", { body: { email: "dani_7@example.com", password: "nope nope nope" }, ip: "5.5.5.7" });
    const slow = await call("/auth/login", { body: { email: "dani_7@example.com", password: "a long pass phrase" }, ip: "5.5.5.8" });
    expect(slow.status).toBe(429);
    expect(slow.data.error).toBe("slow_down");
    t += 5000;
    expect((await call("/auth/login", { body: { email: "dani_7@example.com", password: "a long pass phrase" }, ip: "5.5.5.8" })).status).toBe(200);
  }, 20000);
  it("password change revokes other sessions; logout all", async () => {
    const reg = await call("/auth/register", { body: { email: "user_a@example.com", password: "first password!" } });
    const s2 = (await call("/auth/login", { body: { email: "user_a@example.com", password: "first password!" } })).data.token;
    const ch = await call("/auth/password", { body: { current: "first password!", next: "second password!" }, token: reg.data.token });
    expect(ch.status).toBe(200);
    expect((await call("/me", { token: s2 })).status).toBe(401);
    expect((await call("/me", { token: reg.data.token })).status).toBe(401);
    expect((await call("/me", { token: ch.data.token })).status).toBe(200);
    const s3 = (await call("/auth/login", { body: { email: "user_a@example.com", password: "second password!" } })).data.token;
    await call("/auth/logout", { body: { all: true }, token: s3 });
    expect((await call("/me", { token: ch.data.token })).status).toBe(401);
  }, 20000);
  it("upgrades lower iteration count on login", async () => {
    await call("/auth/register", { body: { email: "olduser@example.com", password: "old password 1" } });
    const { hashPassword } = await import("../lib/crypto.js");
    const h = await hashPassword("old password 1", 1000);
    env.DB.raw.prepare("UPDATE credentials SET hash = ?, salt = ?, iterations = 1000 WHERE kind = 'password'").run(h.hash, h.salt);
    expect((await call("/auth/login", { body: { email: "olduser@example.com", password: "old password 1" } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT iterations FROM credentials WHERE kind = 'password'").get().iterations).toBe(100000);
  }, 20000);
});

describe("recovery via an old personal link (accounts not yet verified)", () => {
  it("/auth/recover sets a new password with the link; revokes sessions, keeps the link", async () => {
    const reg = await call("/auth/register", { body: { email: "forgetful@example.com", password: "original pass 1" } });
    expect(reg.status).toBe(200);
    const link = await giveLink(reg.data.token);
    const other = (await call("/auth/login", { body: { email: "forgetful@example.com", password: "original pass 1" } })).data.token;
    expect((await call("/auth/recover", { body: { link, password: "short" } })).data.error).toBe("weak_password");
    const ch = await call("/auth/recover", { body: { link, password: "recovered pass 1" } });
    expect(ch.status).toBe(200);
    expect(ch.data.email).toBe("forgetful@example.com");
    expect((await call("/me", { token: reg.data.token })).status).toBe(401);
    expect((await call("/me", { token: other })).status).toBe(401);
    expect((await call("/me", { token: ch.data.token })).status).toBe(200);
    expect((await call("/auth/login", { body: { email: "forgetful@example.com", password: "original pass 1" } })).status).toBe(401);
    expect((await call("/auth/login", { body: { email: "forgetful@example.com", password: "recovered pass 1" } })).status).toBe(200);
    // הקישור נשאר — אפשר לשחזר שוב
    expect((await call("/auth/recover", { body: { link, password: "recovered pass 2" } })).status).toBe(200);
  }, 30000);
  it("/auth/link logs in with the link (normal session); link itself is not a Bearer", async () => {
    const reg = await call("/auth/register", { body: { email: "linker@example.com", password: "original pass 3" } });
    reg.data.link = await giveLink(reg.data.token);
    const r = await call("/auth/link", { body: { link: reg.data.link }, ip: "8.8.8.1" });
    expect(r.status).toBe(200);
    expect(r.data.email).toBe("linker@example.com");
    expect((await call("/me", { token: r.data.token })).data.emails[0].email).toBe("linker@example.com");
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
    const reg = await call("/auth/register", { body: { email: "session_user@example.com", password: "original pass 2" } });
    const r = await call("/auth/password", { body: { next: "another pass 22" }, token: reg.data.token });
    expect(r).toMatchObject({ status: 401, data: { error: "bad_credentials" } });
    const w = await call("/auth/password", { body: { current: "wrong pass 222", next: "another pass 22" }, token: reg.data.token });
    expect(w.status).toBe(401);
    // הקישור אינו Bearer גם כאן
    expect((await call("/auth/password", { body: { next: "another pass 22" }, token: reg.data.link })).status).toBe(401);
    expect((await call("/auth/login", { body: { email: "session_user@example.com", password: "original pass 2" } })).status).toBe(200);
  }, 30000);
  it("removed email endpoints are gone", async () => {
    for (const p of ["/auth/email", "/auth/email/verify"]) expect((await call(p, { body: {} })).status).toBe(404);
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
  it.each([{ open: false }, { open: true, policy: "open-all-v1" }, { open: true, policy: "open-all-v2" }])("ignores cached snapshots and reads current data: %j", async (old) => {
    await crowd(1);
    await env.DB.prepare("INSERT INTO aggregates (aggregation_id, published_at, section, json) VALUES (?, ?, ?, ?)")
      .bind("old", new Date(t).toISOString(), "dashboard", JSON.stringify({ ...old, participants: 1 })).run();
    const first = await call("/dashboard");
    expect(first.data).toMatchObject({ open: true, policy: "verified-v6", participants: 1 });
    expect(first.data.seats.n).toBe(1);
    expect(first.data.matrix.rows["מחל"].n).toBe(1);
    const before = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM aggregates").get().n;
    const second = await call("/dashboard");
    expect(second.data).toEqual(first.data);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM aggregates").get().n).toBe(before);
  });
  it("מחשב שינוי במנדטים ובהצבעה מיד בלי cron ובלי לכתוב תמונות", async () => {
    const token = await newP();
    await save(token,"seats",seats(40));
    await save(token,"vote",{v2022:"מחל",v2026:"likud"});
    const first = await call("/dashboard");
    await save(token,"seats",seats(55));
    await save(token,"vote",{v2022:"מחל",v2026:"yashar"});
    const next = await call("/dashboard");
    expect(first.data.seats.full[0].mean).toBe(40);
    expect(next.data.seats.full[0].mean).toBe(55);
    expect(next.data.matrix.rows["מחל"].cells.yashar.n).toBe(1);
    expect(next.data.byVote.yashar).toBeDefined();
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM aggregates").get().n).toBe(0);
    expect(JSON.stringify(next.data)).not.toContain('"participant"');
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
    expect(d.data.matrix.rows["מחל"].n).toBe(30); // הפילוח עדכני בתמונת הפרסום הראשונה
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

it("סכום הקואליציה נשמר ונקרא בחשבון ובהיסטוריה באותה גרסה בלי שמירת גושים", async () => {
  const tok = await newP();
  const payload = {start:'zero',pollsAsOf:null,seats:{likud:{v:30,src:'manual',locked:true},shas:{v:8,src:'manual',locked:true},democrats:{v:82,src:'manual',locked:true}}};
  const result = await save(tok,'seats',payload,'coalition-op-001');
  expect(result.status).toBe(200);
  expect(result.data.version.payload.coalitionSeats).toBe(38);
  const me = (await call('/me',{token:tok})).data;
  expect(me.latest.seats.payload.coalitionSeats).toBe(38);
  expect(me.latest.blocs).toBeUndefined();
  expect((await call('/history?unit=seats',{token:tok})).data.versions[0].payload.coalitionSeats).toBe(38);
  expect((await save(tok,'seats',{...payload,coalitionSeats:99},'coalition-op-001')).data.version.id).toBe(result.data.version.id);
});

describe("העדפות — המחנות נשמרים על המשתמש", () => {
  it("נשמרים, מוחזרים ב-/me, נדחים כשאינם תקינים ונמחקים עם החשבון", async () => {
    const token = await newP();
    expect((await call("/me", { token })).data.prefs).toEqual({ camps: null });
    const ok = await call("/prefs", { token, body: { camps: { yashar: "", likud: "likud" } } });
    expect(ok.status).toBe(200);
    expect((await call("/me", { token })).data.prefs).toEqual({ camps: { yashar: "", likud: "likud" } });
    await call("/prefs", { token, body: { camps: { yashar: "nu_camp" } } });
    expect((await call("/me", { token })).data.prefs.camps).toEqual({ yashar: "nu_camp" });
    expect((await call("/prefs", { token, body: { camps: { nope: "x" } } })).status).toBe(400);
    expect((await call("/prefs", { token, body: { camps: { likud: "<b>" } } })).status).toBe(400);
    expect((await call("/prefs", { body: { camps: {} } })).status).toBe(401);
    expect((await call("/delete", { token, body: { confirm: "מחק" } })).status).toBe(200);
  });
});

it('כל שמירת מפלגות שומרת גושים קבועים ואישיים לפי ההרכב האחרון', async () => {
  const tok = await newP();
  const definition = (lists) => ({mode:'custom',blocs:[{id:'mine',name:'שלי',lists,target:null}]});
  expect((await save(tok,'blocs',definition(['likud','yashar']))).status).toBe(200);
  const original = await save(tok,'seats',seats(60));
  expect(original.status).toBe(200);
  expect(Object.keys(original.data.version.payload.fixedBlocSeats)).toEqual(['government','coalition','opposition','unity','arab']);
  expect(original.data.version.payload.personalBlocSeats).toEqual([{id:'mine',name:'שלי',lists:['likud','yashar'],seats:120}]);
  await save(tok,'blocs',{mode:'custom',blocs:[{id:'mine',name:'שלי החדש',lists:['likud','shas'],target:null}]});
  t += 24 * 3600 * 1000; // יום אחר: ההשערה הקודמת נשארת בהיסטוריה
  const next = await save(tok,'seats',seats(60));
  expect(next.data.version.payload.personalBlocSeats[0].seats).toBe(60);
  const history = (await call('/history?unit=seats',{token:tok})).data.versions;
  expect(history.find(v=>v.id===original.data.version.id).payload.personalBlocSeats[0].seats).toBe(120);
});

it('שינוי הרכב שומר אותו שם, שם ריק ומחיקת כל הגושים נשמרים', async () => {
 const tok=await newP();const payload=(name,lists)=>({mode:'custom',blocs:[{id:'x',name,lists,target:null}]});
 expect((await save(tok,'blocs',payload('שלי',['likud','shas']))).status).toBe(200);
 expect((await save(tok,'blocs',payload('שלי',['likud','utj']))).status).toBe(200);
 expect((await save(tok,'blocs',payload('',['likud','utj']))).status).toBe(200);
 expect((await save(tok,'blocs',{mode:'custom',blocs:[]})).status).toBe(200);
 expect((await call('/me',{token:tok})).data.latest.blocs.payload.blocs).toEqual([]);
 const saved=await save(tok,'seats',seats(60));
 expect(saved.data.version.payload.personalBlocSeats).toEqual([]);
 expect(saved.data.version.payload.fixedBlocSeats).toBeDefined();
});

it('רק שם שאושר מוצג לכולם לפי הרכב ולא לפי שם אישי', async () => {
 const a=await newP();const b=await newP();
 for(const tok of [a,b]) { await save(tok,'seats',seats(60));await save(tok,'blocs',{mode:'custom',blocs:[{id:'x',name:'אישי',lists:['likud','shas'],target:null}]}); }
 await env.DB.prepare("INSERT INTO bloc_display_names (composition, lists, name, status, suggested_at) VALUES (?, ?, ?, 'suggested', ?)").bind('likud,shas','["likud","shas"]','שם מוצע','2026-10-09').run();
 const before=(await call('/dashboard')).data;
 expect(before.blocs.custom[0].name).toBe('אישי');
 await env.DB.prepare("UPDATE bloc_display_names SET status = 'approved', approved_at = ? WHERE composition = ?").bind('2026-10-09','likud,shas').run();
 resetDashboardCache(); // שינוי ישיר במאגר, לא דרך השרת
 const after=(await call('/dashboard')).data;
 expect(after.blocs.custom[0].name).toBe('שם מוצע');
 expect(after.blocs.custom[0].derived).toEqual(before.blocs.custom[0].derived);
 expect((await call('/me',{token:a})).data.latest.blocs.payload.blocs[0].name).toBe('אישי');
});

describe("סטטיסטיקות חיות", () => {
  it("שמירה חדשה נכנסת מיד לסטטיסטיקות, בלי להמתין לחצי הדקה", async () => {
    const first = (await call("/dashboard")).data;
    expect((await call("/dashboard")).data).toEqual(first);
    expect((await save(await newP(), "seats", seats(60))).status).toBe(200);
    expect((await call("/dashboard")).data.participants).toBe(first.participants + 1);
  });
});

describe("admin guesses dashboard (no identifiers)", () => {
  const KEY = "k".repeat(40);
  const admin = (path, body) =>
    worker.fetch(new Request("https://w.example" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-admin-key": KEY }, body: body ? JSON.stringify(body) : undefined }), env).then(async (r) => ({ status: r.status, data: await r.json() }));
  it("lists every latest guess without ids; approving a flagged guess brings it into the statistics", async () => {
    await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
    expect((await worker.fetch(new Request("https://w.example/admin/guesses"), env)).status).toBe(401);
    const a = await newP(), b = await newP(), c = await newP(), d4 = await newP();
    await save(a, "seats", seats(60));
    await save(b, "seats", seats(60));
    await save(d4, "seats", seats(60));
    // גושים: a שמר גוש אישי, והאחרים בברירת מחדל
    expect((await save(a, "blocs", { mode: "custom", blocs: [{ id: "x1", name: "הגוש שלי", lists: [IDS[0], IDS[1]], target: 100 }] })).status).toBe(200);
    const odd = await save(c, "seats", seats(100));
    resetDashboardCache();
    expect((await call("/dashboard")).data.pendingGuesses).toBe(1);
    expect((await call("/me", { token: c })).data.seatsPending).toBe(true);
    const r = await admin("/admin/guesses");
    expect(r.data.rows).toHaveLength(4);
    const text = JSON.stringify(r.data);
    for (const tok of [a, b, c, d4]) expect(text).not.toContain(tok);
    expect(text).not.toContain(String(odd.data.version.id) + ",");
    for (const row of r.data.rows) expect(Object.keys(row).sort()).toEqual(["blocs", "day", "handle", "mode", "reasons", "seats", "status", "verified"]);
    // כל שורה כוללת את הגושים: אישיים עם סכום המנדטים והיעד, או ברירת המחדל (5 גושים) כשלא נשמרה הגדרה
    const mine = r.data.rows.find((x) => x.blocs.saved);
    expect(mine.blocs.items).toEqual([{ name: "הגוש שלי", lists: [IDS[0], IDS[1]], seats: 120, target: 100 }]);
    const def = r.data.rows.filter((x) => !x.blocs.saved);
    expect(def).toHaveLength(3);
    expect(def[0].blocs.items.map((b) => b.name)).toEqual(["הממשלה היוצאת", "גוש הקואליציה", "גוש האופוזיציה", "אחדות", "ערבים"]);
    const pending = r.data.rows.find((x) => x.status === "pending");
    expect(pending.reasons[0]).toMatchObject({ list: IDS[0], rule: "ratio" });
    expect((await admin("/admin/guesses/decide", { salt: "wrong-salt-1234", handle: pending.handle, decision: "approved" })).status).toBe(404);
    expect((await admin("/admin/guesses/decide", { salt: r.data.salt, handle: pending.handle, decision: "approved" })).status).toBe(200);
    resetDashboardCache();
    const d = (await call("/dashboard")).data;
    expect(d.pendingGuesses).toBe(0);
    expect(d.seats.n).toBe(4);
    expect((await admin("/admin/guesses")).data.rows.filter((x) => x.status === "approved")).toHaveLength(1);
  });
});


describe("חשבונות שלא אומתו (הכרעת בעלים 9.10.2026)", () => {
  const KEY = "k".repeat(40);
  const admin = (path) => worker.fetch(new Request("https://w.example" + path, { headers: { "x-admin-key": KEY } }), env).then(async (r) => ({ status: r.status, data: await r.json() }));
  it("נספרים בסטטיסטיקות כמו כולם, עם הערה כמה מאומתים; בניהול מרוכזים באזור נפרד", async () => {
    await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
    const ok = (await register()).data.token;
    const unv = (await register(undefined, undefined, { verified: false })).data.token;
    await save(ok, "seats", seats(60));
    await save(unv, "seats", seats(55));
    resetDashboardCache();
    let d = (await call("/dashboard")).data;
    expect(d.participants).toBe(2);
    expect(d.seats.n).toBe(2);
    expect(d.accounts).toEqual({ verified: 1, total: 2 });
    expect((await call("/me", { token: unv })).data.verified).toBe(false);
    expect((await call("/me", { token: ok })).data.verified).toBe(true);
    // האזור הנפרד בניהול: סימון verified בכל שורה, וסיכום של הלא מאומתים (ממוצע מנדטים) בלי מזהים
    const g = (await admin("/admin/guesses")).data;
    expect(g.rows.map((r) => r.verified).sort()).toEqual([false, true]);
    expect(g.unverified.participants).toBe(1);
    expect(g.unverified.means[IDS[0]]).toBe(55);
    // אימות ⇐ ההערה מתעדכנת, הסטטיסטיקות לא משתנות
    env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = (SELECT participant FROM sessions WHERE token_hash = ?)").run(await sha256(unv));
    resetDashboardCache();
    d = (await call("/dashboard")).data;
    expect(d.participants).toBe(2);
    expect(d.accounts).toEqual({ verified: 2, total: 2 });
  });
});
