import { describe, it, expect, beforeEach } from "vitest";
import worker, { resetDashboardCache, groupParticipants, UPLOAD_PART } from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { sha256 } from "../lib/crypto.js";

// חיסכון בקריאות (הכרעת בעלים 24.10.2026, docs/תוכנית-חיסכון-קריאות-קבוצות-24-10-2026.md):
// אותן תוצאות בדיוק כמו קודם, בלי מעבר על כל רשימות הקבוצות, ומונה הגודל תמיד שווה לספירה האמיתית.
const KEY = "k".repeat(40);
let env, t, ipN = 0, op = 0;
beforeEach(async () => {
  resetDashboardCache();
  t = Date.parse("2026-10-24T18:00:00Z");
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: "https://hopetohelp.github.io/26/", IP_KEY: "ip-secret", DATA_KEY: "data-secret", NOW: () => t, DASHBOARD_MIN_MS: 0 };
  await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
});
const call = async (path, { body, token, admin } = {}) => {
  const res = await worker.fetch(new Request("https://w.example" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.9.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { "x-admin-key": KEY } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: res.status, data: await res.json().catch(() => null) };
};
const emails = (n, from = 0) => Array.from({ length: n }, (_, i) => `u${i + from}@x.co`);
const rows = (sql, ...a) => env.DB.raw.prepare(sql).all(...a).map((r) => ({ ...r }));
async function account(email) {
  const r = await call("/auth/register", { body: { email, password: "a long pass phrase" } });
  env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = (SELECT participant FROM sessions WHERE token_hash = ?)").run(await sha256(r.data.token));
  return r.data.token;
}

// השאילתה הקודמת, כלשונה — לבדיקת זהות התוצאות
const OLD = `SELECT m.group_id, e.participant FROM (SELECT group_id, email_hash FROM group_members UNION SELECT group_id, email_hash FROM group_managers) m JOIN emails e ON e.hash = m.email_hash WHERE e.verified = 1
  UNION SELECT j.group_id, j.participant FROM group_link_joins j JOIN group_link_flags f ON f.group_id = j.group_id AND f.flag = 'all' AND f.on_ = 1
  UNION SELECT j.group_id, j.participant FROM group_link_first j JOIN group_link_flags f ON f.group_id = j.group_id AND f.flag = 'first' AND f.on_ = 1`;
const sorted = (r) => r.map((x) => `${x.group_id}|${x.participant}`).sort();

describe("group membership — same answers, no full scan", () => {
  it("זהה לשאילתה הקודמת בנתונים אקראיים: הכול, לפי משתמש ולפי קבוצה", () => {
    const db = env.DB.raw;
    let seed = 7;
    const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
    for (const g of ["a", "b", "c"]) db.prepare("INSERT INTO groups (id, name_enc, created_at) VALUES (?, 'x', 't')").run(g);
    for (let i = 0; i < 300; i++) {
      db.prepare("INSERT INTO participants (id, created_at) VALUES (?, 't')").run(`p${i}`);
      for (let k = 0; k < 1 + rnd(3); k++) db.prepare("INSERT OR IGNORE INTO emails (hash, participant, enc, source, verified, created_at) VALUES (?, ?, 'e', 'added', ?, 't')").run(`h${rnd(500)}`, `p${i}`, rnd(3) ? 1 : 0);
    }
    for (let i = 0; i < 900; i++) db.prepare("INSERT OR IGNORE INTO group_members (group_id, email_hash) VALUES (?, ?)").run("abc"[rnd(3)], `h${rnd(600)}`);
    for (let i = 0; i < 20; i++) db.prepare("INSERT OR IGNORE INTO group_managers (group_id, email_hash, added_at) VALUES (?, ?, 't')").run("abc"[rnd(3)], `h${rnd(600)}`);
    for (let i = 0; i < 80; i++) {
      db.prepare("INSERT OR IGNORE INTO group_link_joins (group_id, participant, joined_at) VALUES (?, ?, 't')").run("abc"[rnd(3)], `p${rnd(300)}`);
      db.prepare("INSERT OR IGNORE INTO group_link_first (group_id, participant) VALUES (?, ?)").run("abc"[rnd(3)], `p${rnd(300)}`);
    }
    db.prepare("INSERT INTO group_link_flags (group_id, flag, on_, updated_at) VALUES ('a', 'all', 1, 't'), ('b', 'first', 1, 't'), ('c', 'all', 0, 't')").run();
    const all = sorted(rows(OLD));
    expect(all.length).toBeGreaterThan(100);
    expect(sorted(rows(groupParticipants()))).toEqual(all);
    for (let i = 0; i < 300; i += 7) expect(sorted(rows(groupParticipants({ participant: "?1" }), `p${i}`))).toEqual(sorted(rows(`SELECT * FROM (${OLD}) WHERE participant = ?`, `p${i}`)));
    for (const g of "abc") expect(sorted(rows(groupParticipants({ group: "?1" }), g))).toEqual(sorted(rows(`SELECT * FROM (${OLD}) WHERE group_id = ?`, g)));
  });

  it("כניסה, מסכי הקבוצה, הניהול והחישוב — בלי מעבר על כל רשימת המיילים", async () => {
    await call("/admin/groups/import", { admin: true, body: { group: "g1", name: "קבוצה", emails: emails(250) } });
    const token = await account("u3@x.co");
    const mgr = await account("boss@x.co");
    await call("/admin/groups/managers", { admin: true, body: { group: "g1", email: "boss@x.co" } });
    const seen = [];
    const prepare = env.DB.prepare;
    env.DB.prepare = (sql) => { seen.push(sql); return prepare(sql); };
    expect((await call("/me", { token })).data.groups.map((g) => g.id)).toEqual(["g1"]);
    const me = (await call("/me", { token: mgr })).data;
    expect(me.managedGroups).toMatchObject([{ id: "g1", members: 250 }]);
    expect((await call("/group/stats?group=g1", { token: mgr })).status).toBe(200);
    expect((await call("/group/link-members?group=g1", { token: mgr })).status).toBe(200);
    expect((await call("/admin/groups", { admin: true })).data.groups).toMatchObject([{ id: "g1", members: 250 }]);
    expect((await call("/dashboard?group=g1", { token })).status).toBe(200);
    expect((await call("/group/import", { token: mgr, body: { group: "g1", emails: ["new@x.co"] } })).data).toMatchObject({ added: 1, members: 251 });
    env.DB.prepare = prepare;
    const touching = [...new Set(seen)].filter((s) => /group_members/.test(s));
    expect(touching.length).toBeGreaterThanOrEqual(5);
    for (const sql of touching) {
      const n = (sql.match(/\?\d*/g) || []).reduce((m, p) => Math.max(m, p === "?" ? m + 1 : Number(p.slice(1))), 0);
      const plan = rows(`EXPLAIN QUERY PLAN ${sql}`, ...Array(n).fill("x")).map((r) => r.detail).join("\n");
      expect(plan, sql).not.toMatch(/SCAN (group_members|m)\b/);
      // חיפוש לפי קבוצה בלבד = מעבר על כל מיילי הקבוצה (למשל COUNT) — אסור גם הוא
      expect(plan, sql).not.toMatch(/SEARCH (group_members|m) USING [^\n]*\(group_id=\?\)/);
    }
  });

  it("מונה הגודל שווה תמיד לספירה האמיתית: הוספה, החלפה, העלאה בשלבים, מחיקת חברים ומחיקת קבוצה", async () => {
    const check = () => {
      const real = Object.fromEntries(rows("SELECT group_id, COUNT(*) AS n FROM group_members GROUP BY group_id").map((r) => [r.group_id, r.n]));
      for (const r of rows("SELECT group_id, members FROM group_sizes")) expect(r.members, r.group_id).toBe(real[r.group_id] ?? 0);
      for (const g of Object.keys(real)) expect(rows("SELECT 1 FROM group_sizes WHERE group_id = ?", g).length, g).toBe(1);
    };
    await call("/admin/groups/import", { admin: true, body: { group: "g1", name: "א", emails: emails(30) } });
    await call("/admin/groups/import", { admin: true, body: { group: "g2", name: "ב", emails: emails(20, 10) } });
    check();
    expect((await call("/admin/groups/import", { admin: true, body: { group: "g1", emails: emails(15, 25) } })).data).toMatchObject({ added: 10, duplicates: 5, members: 40 });
    check();
    expect((await call("/admin/groups/import", { admin: true, body: { group: "g1", emails: emails(5, 500), mode: "replace" } })).data).toMatchObject({ added: 5, members: 5 });
    check();
    let r = await call("/admin/groups/upload", { admin: true, body: { group: "g2", emails: emails(UPLOAD_PART * 2 + 3, 15), mode: "add" } });
    while (!r.data.finished) { check(); r = await call("/admin/groups/upload/continue", { admin: true, body: { group: "g2", upload: r.data.upload } }); }
    expect(r.data).toMatchObject({ added: UPLOAD_PART * 2 + 3 - 15, members: UPLOAD_PART * 2 + 3 + 5 });
    check();
    await call("/admin/groups/upload", { admin: true, body: { group: "g2", emails: emails(UPLOAD_PART + 1, 900), mode: "replace" } });
    await worker.scheduled({}, env, null);
    check();
    expect(rows("SELECT members FROM group_sizes WHERE group_id = 'g2'")[0].members).toBe(UPLOAD_PART + 1);
    await call("/admin/groups/import", { admin: true, body: { group: "g1", emails: [], mode: "replace" } });
    check();
    await call("/admin/groups/delete", { admin: true, body: { group: "g2" } });
    check();
    expect(rows("SELECT * FROM group_sizes WHERE group_id = 'g2'")).toEqual([]);
  });

  it("פרסום חוזר של מבנה המאגר מתקן מונה שסטה, ושומר על הקיים", async () => {
    await call("/admin/groups/import", { admin: true, body: { group: "g1", name: "א", emails: emails(12) } });
    env.DB.raw.exec("UPDATE group_sizes SET members = 999");
    env.DB.raw.exec("INSERT INTO group_sizes (group_id, members) VALUES ('ghost', 4)");
    const { readFileSync } = await import("node:fs");
    env.DB.raw.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
    expect(rows("SELECT group_id, members FROM group_sizes ORDER BY group_id")).toEqual([{ group_id: "g1", members: 12 }, { group_id: "ghost", members: 0 }]);
    expect(rows("SELECT COUNT(*) AS n FROM group_members")[0].n).toBe(12);
  });
});
