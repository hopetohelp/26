import { describe, it, expect, beforeEach } from "vitest";
import worker, { resetDashboardCache, GROUP_MIN } from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { seats } from "./helpers.js";
import { sha256 } from "../lib/crypto.js";

// דשבורד לפי קבוצה (docs/פילוח-קבוצות-תכנון.md): רק לחבר, רק מייל מאומת, סף מינימום, ובלי סימן לגולש אחר
const KEY = "k".repeat(40);
let env, t, ipN = 0, un = 0, op = 0;
beforeEach(async () => {
  resetDashboardCache();
  t = Date.parse("2026-10-11T10:05:00Z");
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: "https://hopetohelp.github.io/26/", IP_KEY: "ip-secret", DATA_KEY: "data-secret", NOW: () => t };
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

    // מתחת לסף: רק הודעה, בלי נתונים
    expect((await call("/me", { token: members[0] })).data.groups).toEqual([{ id: "gizra", name: "הגזרה" }]);
    let d = (await call("/dashboard?group=gizra", { token: members[0] })).data;
    expect(d).toEqual({ group: "gizra", belowMin: true, min: GROUP_MIN, publishedAt: expect.any(String) });

    // חבר נוסף נרשם אחרי טעינת הרשימה — נכנס לבד (הצלבה בכל חישוב)
    members.push(await account(`m${GROUP_MIN - 1}@x.co`, true, 70));
    resetDashboardCache();
    d = (await call("/dashboard?group=gizra", { token: members[0] })).data;
    expect(d).toMatchObject({ group: "gizra", participants: GROUP_MIN, open: true, underReview: null });
    expect(d.pendingGuesses).toBeUndefined();
    expect(d.seats).toBeTruthy();
    // ההשערה של מי שמחוץ לקבוצה אינה בחישוב שלה: הכללי כולל גם אותו (הלא מאומת אינו נספר בשניהם)
    expect((await call("/dashboard")).data.participants).toBe(GROUP_MIN + 1);
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
    expect((await call("/me", { token: mgr })).data.managedGroups).toEqual([{ id: "gizra", name: "הגזרה" }]);
    expect((await call("/me", { token: other })).data.managedGroups).toEqual([]);
    expect((await call("/group/mine", { token: mgr })).data.groups).toEqual([{ id: "gizra", name: "הגזרה", members: 1 }]);
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
