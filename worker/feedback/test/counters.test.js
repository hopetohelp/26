import { beforeEach, expect, it } from "vitest";
import feedback from "../index.js";
import { fakeD1 } from "../../crowd/test/fakeD1.js";
import { sha256 } from "../../crowd/lib/crypto.js";

const origin = "https://hopetohelp.github.io";
const admin = "b".repeat(40);
const AUTO = "[כשל חיבור אוטומטי]";
let env;
const data = async () => (await feedback.fetch(new Request("https://w.example/admin/data", { headers: { origin, authorization: `Bearer ${admin}` } }), env)).json();
const note = (at, text) => env.DB.raw.prepare("INSERT INTO feedback (created_at, topic, text, day_key) VALUES (?, 'other', ?, 'k')").run(at, text);

beforeEach(async () => {
  env = { DB: fakeD1(new URL("../schema.sql", import.meta.url)), ALLOWED_ORIGIN: origin, CROWD: { fetch: async request => new Response(JSON.stringify(new URL(request.url).pathname === "/usage" ? { totalUsers: 0 } : { stats: {}, threads: [] })) } };
  await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(admin), "2026-10-01").run();
});

it("נפילות נספרות רק מאז סימון האיפוס, וההודעות הישנות נשמרות", async () => {
  const from = env.DB.raw.prepare("SELECT value FROM counter_marks WHERE name = 'failures_from'").get().value;
  note("2026-10-11T10:00:00.000Z", `${AUTO} לפני האיפוס`);
  note("2026-10-11T10:05:00.000Z", `${AUTO} לפני האיפוס 2`);
  note("2099-01-01T00:00:00.000Z", `${AUTO} אחרי האיפוס`);
  note("2099-01-01T00:00:00.000Z", "הערה רגילה של גולש");
  const r = await data();
  expect(r.failures).toEqual({ since: from, total: 1 });
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback WHERE text LIKE ?").get(`${AUTO}%`).n).toBe(3);
});

it("איפוס נוסף = עדכון הסימון; בלי סימון סופרים מההתחלה", async () => {
  note("2026-10-11T10:00:00.000Z", `${AUTO} ישנה`);
  env.DB.raw.prepare("UPDATE counter_marks SET value = '2026-10-11T10:00:01.000Z' WHERE name = 'failures_from'").run();
  expect((await data()).failures.total).toBe(0);
  env.DB.raw.prepare("DELETE FROM counter_marks").run();
  expect((await data()).failures).toEqual({ since: null, total: 1 });
});

it("סך הכניסות מתעלם ממוני האבחון", async () => {
  env.DB.raw.prepare("INSERT INTO hits (day, page, count) VALUES ('2026-10-11', '/', 5), ('2026-10-11', 'diag:all-blocked', 7)").run();
  expect((await data()).totalVisits).toBe(5);
});

it("מוני האבחון בשורת הנפילות מוצגים בהפרש מתמונת המצב של האיפוס; ב-hits נשארים המלאים", async () => {
  const day = new Date().toISOString().slice(0, 10);
  env.DB.raw.prepare("INSERT INTO hits (day, page, count) VALUES (?, '/', 3), (?, 'diag:blind-sent', 1162), (?, 'diag:all-blocked', 4)").run(day, day, day);
  env.DB.raw.prepare("INSERT INTO counter_baseline (day, page, count) VALUES (?, 'diag:blind-sent', 1162), (?, 'diag:all-blocked', 4)").run(day, day);
  const before = (await data()).days.find((d) => d.day === day);
  expect([before.blindSaved, before.blocked, before.relaySaved]).toEqual([0, 0, 0]);
  env.DB.raw.prepare("UPDATE hits SET count = count + 2 WHERE page = 'diag:blind-sent'").run();
  expect((await data()).days.find((d) => d.day === day).blindSaved).toBe(2);
  expect(env.DB.raw.prepare("SELECT count FROM hits WHERE page = 'diag:blind-sent'").get().count).toBe(1164);
});

it("המונים הציבוריים זהים לניהול, אינם כוללים אבחון ואינם חושפים פרטי גולשים", async () => {
  env.DB.raw.prepare("INSERT INTO hits (day,page,count) VALUES ('2026-10-20','/',4), ('2026-10-21','/polls',3), ('2026-10-21','diag:all-ok',99)").run();
  env.DB.raw.prepare("INSERT INTO visitors_all VALUES ('secret-hash-a','2026-10-20','2026-10-21'), ('secret-hash-b','2026-10-21','2026-10-21')").run();
  const r = await feedback.fetch(new Request("https://w.example/usage", { headers: { origin } }), env);
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBe(origin);
  expect(r.headers.get("cache-control")).toContain("max-age=60");
  const out = await r.json();
  expect(Object.keys(out).sort()).toEqual(["publishedAt", "totalUsers", "totalVisits"]);
  expect(out).toMatchObject({ totalUsers: 0, totalVisits: 7 });
  expect(Number.isFinite(Date.parse(out.publishedAt))).toBe(true);
  expect(await data()).toMatchObject({ totalVisitors: 2, totalVisits: out.totalVisits });
});

it("מאגר ריק הוא אפס אמיתי; כשל מאגר מחזיר אי-זמינות ולא אפס", async () => {
  const request = () => new Request("https://w.example/usage");
  expect(await (await feedback.fetch(request(), env)).json()).toMatchObject({ totalUsers: 0, totalVisits: 0 });
  const broken = { ...env, DB: { prepare() { throw new Error("offline"); } } };
  const response = await feedback.fetch(request(), broken);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});

it("אותו דפדפן נספר פעם אחת ומשאיר את כל הצפיות; דפדפן נוסף מוסיף משתמש", async () => {
  const hit = (page, v) => feedback.fetch(new Request("https://w.example/hit", { method: "POST", body: JSON.stringify({ page, v }) }), env);
  await hit("/", "a".repeat(22));
  await hit("/polls", "a".repeat(22));
  await hit("/", "b".repeat(22));
  await hit("/", ""); // אחסון חסום: צפייה בלי משתמש ייחודי
  const response = await feedback.fetch(new Request("https://w.example/usage"), env);
  expect(await response.json()).toMatchObject({ totalUsers: 0, totalVisits: 4 });
});

it("מספר החשבונות מגיע משרת ההתחברות, וכשל שלו אינו מוצג כאפס", async () => {
  env.CROWD.fetch = async () => new Response(JSON.stringify({ totalUsers: 17 }));
  const request = () => new Request("https://w.example/usage");
  expect(await (await feedback.fetch(request(), env)).json()).toMatchObject({ totalUsers: 17 });
  env.CROWD.fetch = async () => new Response("offline", { status: 503 });
  expect((await feedback.fetch(request(), env)).status).toBe(503);
});
