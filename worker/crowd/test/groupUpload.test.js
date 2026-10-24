import { describe, it, expect, beforeEach } from "vitest";
import worker, { resetDashboardCache, UPLOAD_PART } from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { sha256 } from "../lib/crypto.js";

// העלאת רשימה בשלבים (הכרעת בעלים 24.10.2026): הקובץ נשמר מוצפן בחלקים, כל קריאה מעבדת חלק, המשימה השעתית משלימה
const KEY = "k".repeat(40);
let env, t, ipN = 0;
beforeEach(async () => {
  resetDashboardCache();
  t = Date.parse("2026-10-24T18:00:00Z");
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: "https://hopetohelp.github.io/26/", IP_KEY: "ip-secret", DATA_KEY: "data-secret", NOW: () => t };
  await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
});
const call = async (path, { body, token, admin } = {}) => {
  const res = await worker.fetch(new Request("https://w.example" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.7.0.${(ipN++ % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { "x-admin-key": KEY } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: res.status, data: await res.json().catch(() => null) };
};
const emails = (n, from = 0) => Array.from({ length: n }, (_, i) => `u${i + from}@x.co`);
const raw = (sql) => env.DB.raw.prepare(sql).get();

describe("group upload in stages", () => {
  it("שומר מוצפן, מעבד חלק בכל קריאה, ומוחק את הקובץ בסוף", async () => {
    await call("/admin/groups/import", { admin: true, body: { group: "g1", name: "קבוצה", emails: [] } });
    const list = [...emails(UPLOAD_PART * 2 + 5), "not-an-email"];
    let r = await call("/admin/groups/upload", { admin: true, body: { group: "g1", emails: list, mode: "add" } });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ total: list.length, done: UPLOAD_PART, finished: false, members: UPLOAD_PART });
    const stored = env.DB.raw.prepare("SELECT data_enc FROM group_upload_parts").all().map((x) => x.data_enc).join("");
    expect(stored).not.toContain("@x.co");
    while (!r.data.finished) r = await call("/admin/groups/upload/continue", { admin: true, body: { group: "g1", upload: r.data.upload } });
    expect(r.data).toMatchObject({ done: list.length, invalid: 1, added: UPLOAD_PART * 2 + 5, members: UPLOAD_PART * 2 + 5 });
    expect(raw("SELECT count(*) AS n FROM group_upload_parts").n).toBe(0);
    expect(raw("SELECT count(*) AS n FROM group_uploads").n).toBe(0);
  });
  it("החלפה מוחקת את הרשימה הקודמת, והמשימה השעתית משלימה העלאה שנעצרה", async () => {
    await call("/admin/groups/import", { admin: true, body: { group: "g1", name: "קבוצה", emails: emails(10, 9000) } });
    const r = await call("/admin/groups/upload", { admin: true, body: { group: "g1", emails: emails(UPLOAD_PART * 3), mode: "replace" } });
    expect(r.data.members).toBe(UPLOAD_PART);
    await worker.scheduled({}, env, null);
    expect(raw("SELECT count(*) AS n FROM group_members WHERE group_id = 'g1'").n).toBe(UPLOAD_PART * 3);
    expect(raw("SELECT count(*) AS n FROM group_upload_parts").n).toBe(0);
  });
  it("רק מנהל הקבוצה, ועד UPLOAD_MAX מיילים", async () => {
    await call("/admin/groups/import", { admin: true, body: { group: "g1", name: "קבוצה", emails: [] } });
    const { data: { token } } = await call("/auth/register", { body: { email: "x@y.co", password: "a long pass phrase" } });
    expect((await call("/group/upload", { token, body: { group: "g1", emails: emails(3) } })).status).toBe(403);
    expect((await call("/admin/groups/upload", { admin: true, body: { group: "g1", emails: emails(2001) } })).status).toBe(400);
  });
});
