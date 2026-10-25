import { describe, it, expect, beforeEach } from "vitest";
import worker, { resetDashboardCache, GROUP_MIN } from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { seats, IDS } from "./helpers.js";
import { sha256 } from "../lib/crypto.js";
import { setPollRanges } from "../lib/moderation.js";
import { TEST_RANGES } from "./setup.js";

// דשבורד לפי קבוצה (docs/פילוח-קבוצות-תכנון.md): רק לחבר, רק מייל מאומת, סף מינימום, ובלי סימן לגולש אחר
const KEY = "k".repeat(40);
let env, t, ipN = 0, un = 0, op = 0;
beforeEach(async () => {
  resetDashboardCache();
  t = Date.parse("2026-10-11T10:05:00Z");
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: "https://hopetohelp.github.io/26/", IP_KEY: "ip-secret", DATA_KEY: "data-secret", NOW: () => t, DASHBOARD_MIN_MS: 0 };
  await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
});
const call = async (path, { body, token, admin } = {}) => {
  const ip = `10.1.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
  const res = await worker.fetch(
    new Request("https://w.example" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { "x-admin-key": KEY } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: res.status, data: await res.json().catch(() => null) };
};
/** חשבון עם השערה. verified = המייל אומת */
async function account(email, verified = true, a = 60) {
  const r = await call("/auth/register", { body: { email, password: "a long pass phrase" } });
  if (verified) env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = (SELECT participant FROM sessions WHERE token_hash = ?)").run(await sha256(r.data.token));
  expect((await call("/save", { token: r.data.token, body: { unit: "seats", op_id: "op-" + String(op++).padStart(8, "0"), registry: "r", payload: seats(a) } })).status).toBe(200);
  return r.data.token;
}
const load = (emails) => call("/admin/groups/import", { admin: true, body: { group: "gizra", name: "הגזרה", emails } });

describe("group dashboard", () => {
  it("members only, verified emails only, threshold, invisible to others", async () => {
    const members = [];
    for (let i = 0; i < GROUP_MIN - 1; i++) members.push(await account(`m${i}@x.co`, true, 70));
    const unverified = await account("u@x.co", false, 70);
    const outsider = await account("o@x.co", true, 40);
    await load([...Array.from({ length: GROUP_MIN }, (_, i) => `m${i}@x.co`), "u@x.co"]);

    // גולש שאינו חבר: אין קבוצות ב-/me, ו-403 לנתונים; בלי חשבון — 401
    expect((await call("/me", { token: outsider })).data.groups).toEqual([]);
    expect((await call("/dashboard?group=gizra", { token: outsider })).status).toBe(403);
    expect((await call("/dashboard?group=gizra")).status).toBe(401);
    // מייל לא מאומת אינו משייך
    expect((await call("/me", { token: unverified })).data.groups).toEqual([]);
    expect((await call("/dashboard?group=gizra", { token: unverified })).status).toBe(403);
    // הדשבורד הכללי אינו מזכיר קבוצות
    resetDashboardCache();
    expect(JSON.stringify((await call("/dashboard")).data)).not.toMatch(/gizra|group/);

    // מתחת לסף: בלי נתונים, רק המונה (הכרעת בעלים 12.10.2026)
    expect((await call("/me", { token: members[0] })).data.groups).toEqual([{ id: "gizra", name: "הגזרה", slug: "hagzara", image: null }]);
    let d = (await call("/dashboard?group=gizra", { token: members[0] })).data;
    expect(d).toEqual({ group: "gizra", belowMin: true, min: GROUP_MIN, participants: GROUP_MIN - 1, publishedAt: expect.any(String), compare: "polls" });

    // חבר נוסף נרשם אחרי טעינת הרשימה — נכנס לבד (הצלבה בכל חישוב)
    members.push(await account(`m${GROUP_MIN - 1}@x.co`, true, 70));
    resetDashboardCache();
    d = (await call("/dashboard?group=gizra", { token: members[0] })).data;
    expect(d).toMatchObject({ group: "gizra", participants: GROUP_MIN, open: true, underReview: null });
    expect(d.pendingGuesses).toBeUndefined();
    expect(d.seats).toBeTruthy();
    // ההשערה של מי שמחוץ לקבוצה אינה בחישוב שלה: הכללי כולל גם אותו (גם הלא מאומת נספר בכללי, אבל אינו חבר בקבוצה)
    expect((await call("/dashboard")).data.participants).toBe(GROUP_MIN + 2);
  });

  it("rejects a bad group id", async () => {
    const tok = await account("a@x.co");
    expect((await call("/dashboard?group=Bad Id", { token: tok })).status).toBe(400);
  });
});

describe("group managers", () => {
  it("a verified manager loads lists for their own group only", async () => {
    const mgr = await account("boss@x.co");
    const other = await account("x@x.co");
    await load(["a@x.co"]);
    await call("/admin/groups/import", { admin: true, body: { group: "other", name: "אחרת", emails: [] } });
    // לפני מינוי — אין הרשאה
    expect((await call("/group/import", { token: mgr, body: { group: "gizra", emails: ["b@x.co"] } })).status).toBe(403);
    expect((await call("/admin/groups/managers", { body: { group: "gizra", email: "Boss@X.co" } })).status).toBe(401);
    expect((await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "Boss@X.co" } })).data).toEqual({ group: "gizra", managers: 1 });
    expect((await call("/me", { token: mgr })).data.managedGroups).toEqual([{ id: "gizra", name: "הגזרה", slug: "hagzara", image: null, members: 1 }]);
    // כמה מנהלים לאותה קבוצה
    const mgr2 = await account("deputy@x.co");
    expect((await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "deputy@x.co" } })).data).toEqual({ group: "gizra", managers: 2 });
    expect((await call("/group/import", { token: mgr2, body: { group: "gizra", emails: ["a@x.co"] } })).data).toMatchObject({ duplicates: 1, members: 1 });
    expect((await call("/admin/groups", { admin: true })).data.groups.find((g) => g.id === "gizra").managers).toBe(2);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "deputy@x.co", remove: true } });
    expect((await call("/me", { token: other })).data.managedGroups).toEqual([]);
    expect((await call("/group/mine", { token: mgr })).data.groups).toEqual([{ id: "gizra", name: "הגזרה", members: 1, slug: "hagzara", image: null }]);
    expect((await call("/group/import", { token: mgr, body: { group: "gizra", emails: ["b@x.co"] } })).data).toMatchObject({ added: 1, members: 2 });
    expect((await call("/group/import", { token: mgr, body: { group: "gizra", emails: ["c@x.co"], mode: "replace" } })).data).toMatchObject({ members: 1 });
    // לא קבוצה אחרת, לא שינוי שם, לא יצירה
    expect((await call("/group/import", { token: mgr, body: { group: "other", emails: ["b@x.co"] } })).status).toBe(403);
    expect((await call("/group/import", { token: mgr, body: { group: "gizra", name: "שם", emails: [] } })).status).toBe(400);
    expect((await call("/group/import", { token: mgr, body: { group: "newgrp", emails: [] } })).status).toBe(403);
    expect((await call("/group/import", { token: other, body: { group: "gizra", emails: ["d@x.co"] } })).status).toBe(403);
    // הסרה
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co", remove: true } });
    expect((await call("/group/import", { token: mgr, body: { group: "gizra", emails: ["d@x.co"] } })).status).toBe(403);
  });

  it("an unverified email does not grant management", async () => {
    const mgr = await account("boss@x.co", false);
    await load([]);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    expect((await call("/group/import", { token: mgr, body: { group: "gizra", emails: ["b@x.co"] } })).status).toBe(403);
  });
});

describe("group manager stats", () => {
  it("counts only from the threshold, for the manager only", async () => {
    const mgr = await account("boss@x.co");
    await load(["boss@x.co"]);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const other = await account("o@x.co");
    expect((await call("/group/stats?group=gizra", { token: other })).status).toBe(403);
    // רשימה קטנה — אין מספרים (אי אפשר לבדוק אדם בודד)
    expect((await call("/group/stats?group=gizra", { token: mgr })).data).toEqual({ group: "gizra", belowMin: true, min: GROUP_MIN });
    const emails = [];
    for (let i = 0; i < GROUP_MIN; i++) { emails.push(`m${i}@x.co`); await account(`m${i}@x.co`); }
    await load(emails);
    const s = (await call("/group/stats?group=gizra", { token: mgr })).data;
    // account() שומר השערת מנדטים לכל אחד; boss נספר גם הוא (ברשימה ומאומת)
    expect(s).toEqual({ group: "gizra", min: GROUP_MIN, registered: GROUP_MIN + 1, today: GROUP_MIN + 1, seats: GROUP_MIN + 1, vote: 0 });
    t += 24 * 3600_000;
    expect((await call("/group/stats?group=gizra", { token: mgr })).data.today).toBe(0);
  });
});

describe("admin: managers list and group stats", () => {
  it("lists managers with email and status, removes by handle, shows the same stats", async () => {
    await load([]);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "Boss@X.co" } });
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "later@x.co" } });
    await account("boss@x.co");
    let g = (await call("/admin/groups", { admin: true })).data.groups[0];
    expect(g.managerList.map((m) => [m.email, m.active])).toEqual([["boss@x.co", true], ["later@x.co", false]]);
    // אין מייל גלוי במאגר
    expect(JSON.stringify((await env.DB.prepare("SELECT * FROM group_manager_labels").all()).results)).not.toMatch(/@/);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", remove: true, handle: g.managerList[1].handle } });
    g = (await call("/admin/groups", { admin: true })).data.groups[0];
    expect(g.managerList.map((m) => m.email)).toEqual(["boss@x.co"]);
    expect(g.managers).toBe(1);
    // הדשבורד של מנהל האתר — אותם מספרים ואותו סף
    expect((await call("/admin/groups/stats", { body: { group: "gizra" } })).status).toBe(401);
    expect((await call("/admin/groups/stats", { admin: true, body: { group: "gizra" } })).data).toEqual({ group: "gizra", belowMin: true, min: GROUP_MIN });
    const emails = [];
    for (let i = 0; i < GROUP_MIN; i++) { emails.push(`m${i}@x.co`); await account(`m${i}@x.co`); }
    await load(emails);
    expect((await call("/admin/groups/stats", { admin: true, body: { group: "gizra" } })).data).toMatchObject({ registered: GROUP_MIN + 1, seats: GROUP_MIN + 1, vote: 0 }); // boss מנהל ואינו ברשימה — נספר בקבוצה
  });
});

describe("managers count as group members (הכרעת בעלים 12.10.2026)", () => {
  it("a verified manager outside the list is counted, sees the group, and is counted once if also listed", async () => {
    await load(["a@x.co", "b@x.co"]);
    const a = await account("a@x.co"), b = await account("b@x.co");
    const boss = await account("boss@x.co");
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    // המנהל אינו ברשימה, ובכל זאת: הקבוצה אצלו ב-/me, והוא נספר
    expect((await call("/me", { token: boss })).data.groups.map((g) => g.id)).toEqual(["gizra"]);
    expect((await call("/dashboard?group=gizra", { token: a })).data).toMatchObject({ belowMin: true, participants: 3 });
    expect((await call("/dashboard?group=gizra", { token: boss })).data).toMatchObject({ belowMin: true, participants: 3 });
    // אותו מייל גם ברשימה וגם במנהלים — פעם אחת
    await load(["a@x.co", "b@x.co", "boss@x.co"]);
    resetDashboardCache();
    expect((await call("/dashboard?group=gizra", { token: b })).data.participants).toBe(3);
    // מנהל שלא אימת מייל אינו נספר ואינו רואה את הקבוצה, כמו כל חשבון
    const lazy = await account("lazy@x.co", false);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "lazy@x.co" } });
    resetDashboardCache();
    expect((await call("/me", { token: lazy })).data.groups).toEqual([]);
    expect((await call("/dashboard?group=gizra", { token: a })).data.participants).toBe(3);
    // הסרת המינוי — מי שאינו ברשימה יוצא מהספירה
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "lazy@x.co", remove: true } });
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co", remove: true } });
    await call("/admin/groups/import", { admin: true, body: { group: "gizra", emails: ["a@x.co", "b@x.co"], mode: "replace" } });
    resetDashboardCache();
    expect((await call("/dashboard?group=gizra", { token: a })).data.participants).toBe(2);
    expect((await call("/me", { token: boss })).data.groups).toEqual([]);
  });

  it("the counter is the group's real count even with nobody counted yet, and the group page is never data below the threshold", async () => {
    await load(["a@x.co"]);
    const a = await account("a@x.co");
    const d = (await call("/dashboard?group=gizra", { token: a })).data;
    expect(d).toEqual({ group: "gizra", belowMin: true, min: GROUP_MIN, participants: 1, publishedAt: expect.any(String), compare: "polls" });
    expect(JSON.stringify(d)).not.toMatch(/seats|blocs|vote|mean/);
  });
});

describe("group insights", () => {
  it("manager only, threshold, counts only — no ids or text", async () => {
    const mgr = await account("boss@x.co");
    const member = await account("m0@x.co", true, 70);
    await load(["m0@x.co"]);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    expect((await call("/group/insights?group=gizra", { token: member })).status).toBe(403);
    expect((await call("/group/insights?group=gizra")).status).toBe(401);
    expect((await call("/group/insights?group=gizra", { token: mgr })).data).toEqual({ group: "gizra", belowMin: true, min: GROUP_MIN });
    for (let i = 1; i < GROUP_MIN; i++) await account(`m${i}@x.co`, true, 70);
    await load(Array.from({ length: GROUP_MIN }, (_, i) => `m${i}@x.co`));
    // רשימה ראשונה: טווח 20–30 ⇐ 70 מנדטים (וגם 60 של המנהל) חורגים
    setPollRanges({ ...TEST_RANGES, [IDS[0]]: { lo: 20, hi: 30 } });
    const d = (await call("/group/insights?group=gizra", { token: mgr })).data;
    // מנהל הקבוצה נספר גם הוא כחבר
    expect(d).toMatchObject({ group: "gizra", guesses: GROUP_MIN + 1, questions: null });
    expect(d.status.inRange + d.status.pending + d.status.approved + d.status.rejected).toBe(GROUP_MIN + 1);
    // כולם מחוץ לטווח, אבל אף השערה אינה רחוקה 75% מממוצע שאר המשתתפים (כולם קרובים זה לזה) ⇐ בטווח לפי הכלל
    expect(d.status.inRange).toBe(GROUP_MIN + 1);
    expect(d.outside).toEqual([{ list: IDS[0], above: GROUP_MIN + 1, below: 0, lo: 20, hi: 30 }]);
    expect(d.outside.length).toBeGreaterThan(0);
    for (const o of d.outside) expect(Object.keys(o).sort()).toEqual(["above", "below", "hi", "list", "lo"]);
    expect(JSON.stringify(d)).not.toMatch(/participant|@/);
  });
});

describe("group series", () => {
  it("hourly for 72 hours, daily before; counts hidden below the threshold", async () => {
    const { seriesBuckets, SERIES_HOURS } = await import("../index.js");
    const now = Date.parse("2026-10-25T10:30:00Z");
    const b = seriesBuckets(Date.parse("2026-10-15T08:00:00Z"), now);
    // השעתי מתחיל ב-24/10 23:00 שעון ישראל (20:00 UTC): עד 10:00 UTC יש 15 שעות
    expect(b.filter((x) => x.hourly)).toHaveLength(15);
    expect(new Date(b.find((x) => x.hourly).start).toISOString()).toBe("2026-10-24T20:00:00.000Z");
    expect(seriesBuckets(Date.parse("2026-10-15T08:00:00Z"), Date.parse("2026-11-01T10:30:00Z")).filter((x) => x.hourly)).toHaveLength(SERIES_HOURS);
    expect(b.filter((x) => !x.hourly).length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < b.length; i++) expect(b[i].start).toBe(b[i - 1].end);

    const mgr = await account("boss@x.co");
    for (let i = 0; i < GROUP_MIN; i++) await account(`m${i}@x.co`, true, 70);
    await load(Array.from({ length: GROUP_MIN }, (_, i) => `m${i}@x.co`));
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const outsider = await account("o@x.co");
    await call("/group/link-join", { token: outsider, body: { slug: "hagzara", first: true } });
    expect((await call("/group/series?group=gizra", { token: outsider })).status).toBe(403);
    const d = (await call("/group/series?group=gizra", { token: mgr })).data;
    const by = Object.fromEntries(d.series.map((s) => [s.key, s]));
    expect(d.series.map((s) => s.key)).toEqual(["list", "linkFirst", "registered", "seats", "vote", "outsideLink", "outsideFirst"]);
    expect(by.list.total).toBe(GROUP_MIN);
    expect(by.registered.total).toBe(GROUP_MIN);
    expect(by.registered.points.at(-1)).toBe(GROUP_MIN);
    expect(by.registered.points).toHaveLength(d.buckets.length);
    expect(by.seats.total).toBe(GROUP_MIN);
    // מתחת לסף — בלי מספר ובלי נקודות
    expect(by.vote).toEqual({ key: "vote", total: null, points: null });
    expect(by.outsideLink).toEqual({ key: "outsideLink", total: null, points: null });
  });
});

describe("group guess moderation", () => {
  it("manager sees and decides only their members' guesses, without activity data", async () => {
    const mgr = await account("boss@x.co");
    for (let i = 0; i < GROUP_MIN; i++) await account(`m${i}@x.co`, true, 70);
    await account("o@x.co", true, 40);
    await load(["m0@x.co"]);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    expect((await call("/group/guesses?group=gizra", { token: mgr })).data).toEqual({ group: "gizra", belowMin: true, min: GROUP_MIN });
    await load(Array.from({ length: GROUP_MIN }, (_, i) => `m${i}@x.co`));
    const d = (await call("/group/guesses?group=gizra", { token: mgr })).data;
    // החברים והמנהל (שנספר כחבר) — בלי הגולש שמחוץ לקבוצה
    expect(d.rows).toHaveLength(GROUP_MIN + 1);
    for (const r of d.rows) for (const k of ["registered", "lastLogin", "logins", "saves", "hasVote", "verified"]) expect(r[k]).toBeUndefined();
    const all = (await call("/admin/guesses", { admin: true })).data;
    const outsider = all.rows.find((r) => r.seats[IDS[0]] === 40);
    // ידית של מי שמחוץ לקבוצה (מטעינת מנהל האתר) — לא נמצאת למנהל הקבוצה
    expect((await call("/group/guesses/decide", { token: mgr, body: { group: "gizra", salt: all.salt, handle: outsider.handle, decision: "rejected" } })).status).toBe(404);
    const row = d.rows[0];
    expect((await call("/group/guesses/decide", { token: mgr, body: { group: "gizra", salt: d.salt, handle: row.handle, decision: "rejected" } })).data).toEqual({ ok: true });
    const member = await account("x@x.co");
    expect((await call("/group/guesses?group=gizra", { token: member })).status).toBe(403);
  });
});

describe("group comparison reference", () => {
  it("defaults to polls; only the manager changes it; members see it", async () => {
    const mgr = await account("boss@x.co");
    const member = await account("m0@x.co");
    await load(["m0@x.co"]);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    expect((await call("/dashboard?group=gizra", { token: member })).data.compare).toBe("polls");
    expect((await call("/group/compare", { token: member, body: { group: "gizra", compare: "crowd" } })).status).toBe(403);
    expect((await call("/group/compare", { token: mgr, body: { group: "gizra", compare: "x" } })).status).toBe(400);
    expect((await call("/group/compare", { token: mgr, body: { group: "gizra", compare: "crowd" } })).data).toEqual({ group: "gizra", compare: "crowd" });
    expect((await call("/group/compare?group=gizra", { token: mgr })).data.compare).toBe("crowd");
    expect((await call("/dashboard?group=gizra", { token: member })).data.compare).toBe("crowd");
  });
});

describe("group support threads", () => {
  it("manager only; nothing below the threshold", async () => {
    const mgr = await account("boss@x.co");
    const member = await account("m0@x.co");
    await load(["m0@x.co"]);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    expect((await call("/group/support?group=gizra", { token: member })).status).toBe(403);
    expect((await call("/group/support?group=gizra", { token: mgr })).data).toEqual({ group: "gizra", belowMin: true, min: GROUP_MIN });
    const body = { group: "gizra", salt: "saltsalt", handle: "a".repeat(32), action: "reply", text: "x" };
    expect((await call("/group/support/act", { token: member, body })).status).toBe(403);
    expect((await call("/group/support/act", { token: mgr, body: { ...body, handle: "bad" } })).status).toBe(400);
    expect((await call("/group/support/act", { token: mgr, body: { ...body, action: "drop" } })).status).toBe(400);
    expect((await call("/group/support/act", { token: mgr, body })).status).toBe(403); // מתחת לסף
  });
});
