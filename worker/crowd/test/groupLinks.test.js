import { describe, it, expect, beforeEach } from "vitest";
import worker, { resetDashboardCache, IMAGE_MAX } from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { sha256 } from "../lib/crypto.js";

// קישור קבוצה (הכרעת בעלים 12.10.2026): שם באנגלית, תמונה, מונה כניסות, והוספת מייל בודד — למנהל האתר ולמנהל הקבוצה
const KEY = "k".repeat(40);
let env, t, ipN = 0;
beforeEach(async () => {
  resetDashboardCache();
  t = Date.parse("2026-10-12T10:05:00Z");
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: "https://hopetohelp.github.io/26/", IP_KEY: "ip-secret", DATA_KEY: "data-secret", NOW: () => t };
  await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
});
const raw = async (path, { body, token, admin, ip } = {}) => {
  const addr = ip ?? `10.2.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
  return worker.fetch(
    new Request("https://w.example" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": addr, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { "x-admin-key": KEY } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
};
const call = async (path, o) => {
  const res = await raw(path, o);
  return { status: res.status, data: await res.json().catch(() => null) };
};
async function managerToken(email = "boss@x.co") {
  const r = await call("/auth/register", { body: { email, password: "a long pass phrase" } });
  env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = (SELECT participant FROM sessions WHERE token_hash = ?)").run(await sha256(r.data.token));
  return r.data.token;
}
const create = (slug = "hagzara") => call("/admin/groups/import", { admin: true, body: { group: "gizra", name: "הגזרה", slug, emails: [] } });
// קובץ JPEG מינימלי (חתימה + תוכן) וקובץ PNG
const dataUrl = (mime, head, size = 64) => `data:${mime};base64,${Buffer.from([...head, ...new Uint8Array(size)]).toString("base64")}`;
const JPEG = dataUrl("image/jpeg", [0xff, 0xd8, 0xff, 0xe0]);
const PNG = dataUrl("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("group link name", () => {
  it("is set at creation or later, unique, English only", async () => {
    expect((await create()).status).toBe(200);
    expect((await call("/admin/groups", { admin: true })).data.groups[0]).toMatchObject({ slug: "hagzara", image: null });
    // כבר תפוס בקבוצה אחרת
    expect((await call("/admin/groups/import", { admin: true, body: { group: "other", name: "אחרת", slug: "hagzara", emails: [] } })).data.error).toBe("slug_taken");
    expect((await call("/admin/groups")).status).toBe(401);
    // שינוי, ואותו שם לאותה קבוצה אינו "תפוס"
    expect((await call("/admin/groups/link", { admin: true, body: { group: "gizra", slug: "the-gizra" } })).data).toEqual({ group: "gizra", slug: "the-gizra" });
    expect((await call("/admin/groups/link", { admin: true, body: { group: "gizra", slug: "the-gizra" } })).status).toBe(200);
    for (const bad of ["הגזרה", "Hagzara", "a", "-ab", "ab-", "has space", "x".repeat(33), "", 5, null])
      expect((await call("/admin/groups/link", { admin: true, body: { group: "gizra", slug: bad } })).data.error, String(bad)).toBe("slug");
    expect((await call("/admin/groups/link", { admin: true, body: { group: "nope", slug: "valid-one" } })).status).toBe(404);
    expect((await call("/admin/groups/link", { body: { group: "gizra", slug: "valid-one" } })).status).toBe(401);
  });

  it("a group manager sets their own group's link only", async () => {
    await create();
    await call("/admin/groups/import", { admin: true, body: { group: "other", name: "אחרת", slug: "other-one", emails: [] } });
    const outsider = await managerToken("who@x.co");
    expect((await call("/group/link", { token: outsider, body: { group: "gizra", slug: "mine-now" } })).status).toBe(403);
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const boss = await managerToken();
    expect((await call("/group/link", { token: boss, body: { group: "gizra", slug: "mine-now" } })).data).toEqual({ group: "gizra", slug: "mine-now" });
    expect((await call("/group/link", { token: boss, body: { group: "gizra", slug: "other-one" } })).data.error).toBe("slug_taken");
    expect((await call("/group/link", { token: boss, body: { group: "other", slug: "stolen-one" } })).status).toBe(403);
    expect((await call("/group/link", { body: { group: "gizra", slug: "mine-now" } })).status).toBe(401);
    expect((await call("/me", { token: boss })).data.managedGroups).toEqual([{ id: "gizra", name: "הגזרה", slug: "mine-now", image: null, members: 0 }]);
  });

  it("public info shows only the name and image to whoever has the link", async () => {
    await create();
    expect((await call("/group/public?slug=hagzara")).data).toEqual({ id: "gizra", slug: "hagzara", name: "הגזרה", image: null });
    expect((await call("/group/public?slug=missing")).status).toBe(404);
    expect((await call("/group/public?slug=Bad Slug")).status).toBe(404);
    expect((await call("/group/public")).status).toBe(404);
  });

  it("deleting the group deletes its link, image and counters", async () => {
    await create();
    await call("/admin/groups/image", { admin: true, body: { group: "gizra", image: JPEG } });
    await call("/group/visit", { body: { slug: "hagzara", fresh: true } });
    await call("/admin/groups/delete", { admin: true, body: { group: "gizra" } });
    for (const table of ["group_links", "group_images", "group_visits"]) expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, table).toBe(0);
    expect((await call("/group/public?slug=hagzara")).status).toBe(404);
  });
});

describe("group image", () => {
  it("admin and manager upload, it is served publicly by link name and by group id, and removed", async () => {
    await create();
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const boss = await managerToken();
    expect((await call("/admin/groups/image", { admin: true, body: { group: "gizra", image: JPEG } })).data).toMatchObject({ group: "gizra", image: expect.any(String) });
    let res = await raw("/group/image?slug=hagzara");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...new Uint8Array(await res.arrayBuffer())].slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
    expect((await call("/group/public?slug=hagzara")).data.image).toEqual(expect.any(String));
    // המנהל מחליף
    t += 1000;
    expect((await call("/group/image", { token: boss, body: { group: "gizra", image: PNG } })).status).toBe(200);
    res = await raw("/group/image?group=gizra");
    expect(res.headers.get("content-type")).toBe("image/png");
    expect((await call("/me", { token: boss })).data.managedGroups[0].image).toEqual(expect.any(String));
    // הסרה
    expect((await call("/group/image", { token: boss, body: { group: "gizra", remove: true } })).data).toEqual({ group: "gizra", image: null });
    expect((await raw("/group/image?slug=hagzara")).status).toBe(404);
  });

  it("rejects wrong types, fake signatures, oversize, and non-managers", async () => {
    await create();
    const svg = "data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64");
    const fake = dataUrl("image/png", [0xff, 0xd8, 0xff, 0xe0]);
    const big = dataUrl("image/jpeg", [0xff, 0xd8, 0xff, 0xe0], IMAGE_MAX + 1);
    for (const image of [svg, fake, big, "data:image/jpeg;base64,@@@", "not a data url", 7, undefined])
      expect((await call("/admin/groups/image", { admin: true, body: { group: "gizra", image } })).data?.error, String(image).slice(0, 20)).toBe("image");
    const outsider = await managerToken("who@x.co");
    expect((await call("/group/image", { token: outsider, body: { group: "gizra", image: JPEG } })).status).toBe(403);
    expect((await call("/group/image", { body: { group: "gizra", image: JPEG } })).status).toBe(401);
    expect((await call("/admin/groups/image", { body: { group: "gizra", image: JPEG } })).status).toBe(401);
  });

  it("accepts the largest allowed image in one request, and no other route takes a body that large", async () => {
    await create();
    const edge = dataUrl("image/jpeg", [0xff, 0xd8, 0xff, 0xe0], IMAGE_MAX - 4);
    expect((await call("/admin/groups/image", { admin: true, body: { group: "gizra", image: edge } })).status).toBe(200);
    expect((await call("/admin/groups/link", { admin: true, body: { group: "gizra", slug: "valid-one", pad: "x".repeat(20000) } })).status).toBe(413);
  });
});

describe("link entries counter", () => {
  it("counts entries, today and distinct browsers, anonymously, for the manager and the admin", async () => {
    await create();
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const boss = await managerToken();
    expect((await call("/group/visit", { body: { slug: "hagzara", fresh: true } })).status).toBe(200);
    await call("/group/visit", { body: { slug: "hagzara", fresh: false } });
    await call("/group/visit", { body: { slug: "hagzara", fresh: true } });
    t += 24 * 3600 * 1000;
    await call("/group/visit", { body: { slug: "hagzara" } });
    expect((await call("/group/visit", { body: { slug: "nope-nope" } })).status).toBe(404);
    const want = { group: "gizra", slug: "hagzara", opens: 4, today: 1, fresh: 2 };
    expect((await call("/group/link-stats?group=gizra", { token: boss })).data).toEqual(want);
    expect((await call("/admin/groups/link-stats", { admin: true, body: { group: "gizra" } })).data).toEqual(want);
    expect((await call("/group/link-stats?group=gizra")).status).toBe(401);
    expect((await call("/group/link-stats?group=gizra", { token: await managerToken("who@x.co") })).status).toBe(403);
    // אין זהות במאגר: רק ספירה ליום
    expect(Object.keys(env.DB.raw.prepare("SELECT * FROM group_visits").get()).sort()).toEqual(["day", "fresh", "group_id", "opens"]);
  });

  it("limits entries per address", async () => {
    await create();
    let last = 0;
    for (let i = 0; i < 250; i++) last = (await raw("/group/public?slug=hagzara", { ip: "10.9.9.9" })).status;
    expect(last).toBe(429);
  });
});

describe("adding a single email", () => {
  it("works through the existing import for both the admin and the manager, and reports the outcome", async () => {
    await create();
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const boss = await managerToken();
    expect((await call("/admin/groups/import", { admin: true, body: { group: "gizra", emails: ["One@X.co"], mode: "add" } })).data).toMatchObject({ added: 1, duplicates: 0, invalid: 0, members: 1 });
    expect((await call("/group/import", { token: boss, body: { group: "gizra", emails: ["one@x.co"], mode: "add" } })).data).toMatchObject({ added: 0, duplicates: 1, members: 1 });
    expect((await call("/group/import", { token: boss, body: { group: "gizra", emails: ["nonsense"], mode: "add" } })).data).toMatchObject({ added: 0, invalid: 1, members: 1 });
    expect((await call("/group/import", { token: boss, body: { group: "gizra", emails: ["two@x.co"], mode: "add" } })).data).toMatchObject({ added: 1, members: 2 });
  });
});

describe("automatic link name from the Hebrew name (הכרעת בעלים 12.10.2026)", () => {
  it("a group created without a link name gets one from its name, unique, and the admin can change it", async () => {
    const a = await call("/admin/groups/import", { admin: true, body: { group: "ga", name: "הגזרה", emails: [] } });
    expect(a.status).toBe(200);
    await call("/admin/groups/import", { admin: true, body: { group: "gb", name: "הגזרה", emails: [] } });
    await call("/admin/groups/import", { admin: true, body: { group: "gc", name: "המושב", slug: "my-own", emails: [] } });
    const slugs = Object.fromEntries((await call("/admin/groups", { admin: true })).data.groups.map((g) => [g.id, g.slug]));
    expect(slugs).toEqual({ ga: "hagzara", gb: "hagzara-2", gc: "my-own" });
    // שם שנקבע ידנית נשאר; שינוי שם הקבוצה לא משנה קישור קיים
    await call("/admin/groups/import", { admin: true, body: { group: "gc", name: "המושב החדש", emails: [] } });
    expect((await call("/group/public?slug=my-own")).data.name).toBe("המושב החדש");
  });

  it("the automatic button (no name in the request) derives it from the group name, for the admin and the manager", async () => {
    // קבוצה שנוצרה לפני שהיה קישור: אין שורה ב-group_links
    await create("manual-one");
    env.DB.raw.prepare("DELETE FROM group_links").run();
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const boss = await managerToken();
    expect((await call("/group/link", { token: boss, body: { group: "gizra" } })).data).toEqual({ group: "gizra", slug: "hagzara" });
    // שוב — אותו שם לאותה קבוצה אינו "תפוס"
    expect((await call("/admin/groups/link", { admin: true, body: { group: "gizra" } })).data).toEqual({ group: "gizra", slug: "hagzara" });
    const outsider = await managerToken("who@x.co");
    expect((await call("/group/link", { token: outsider, body: { group: "gizra" } })).status).toBe(403);
  });

  it("a name with nothing to transliterate cannot be derived (the admin sets one by hand)", async () => {
    const id = "gz";
    await call("/admin/groups/import", { admin: true, body: { group: id, name: "!!!", slug: "typed-by-hand", emails: [] } });
    env.DB.raw.prepare("DELETE FROM group_links").run();
    expect((await call("/admin/groups/link", { admin: true, body: { group: id } })).data.error).toBe("slug");
  });

  it("listing for the admin fills in the link name of groups created before links existed", async () => {
    await create("typed-by-hand");
    env.DB.raw.prepare("DELETE FROM group_links").run();
    expect((await call("/group/public?slug=hagzara")).status).toBe(404);
    expect((await call("/admin/groups", { admin: true })).data.groups[0].slug).toBe("hagzara");
    expect((await call("/group/public?slug=hagzara")).data.name).toBe("הגזרה");
    // שוב — לא משנה
    expect((await call("/admin/groups", { admin: true })).data.groups[0].slug).toBe("hagzara");
  });
});

describe("clearing all group members (הכרעת בעלים 12.10.2026)", () => {
  it("an empty replace clears the list for the admin and the manager, and keeps the group, managers, accounts and guesses", async () => {
    await call("/admin/groups/import", { admin: true, body: { group: "gizra", name: "הגזרה", emails: ["a@x.co", "b@x.co", "boss@x.co"] } });
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const boss = await managerToken();
    const a = await call("/auth/register", { body: { email: "a@x.co", password: "a long pass phrase" } });
    expect((await call("/group/import", { token: boss, body: { group: "gizra", emails: [], mode: "replace" } })).data).toMatchObject({ members: 0 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members").first()).n).toBe(0);
    // הקבוצה, המנהל והחשבונות נשארים
    const g = (await call("/admin/groups", { admin: true })).data.groups[0];
    expect(g).toMatchObject({ id: "gizra", members: 0, managers: 1 });
    expect((await call("/me", { token: a.data.token })).status).toBe(200);
    expect((await call("/me", { token: boss })).data.managedGroups.map((x) => x.id)).toEqual(["gizra"]);
    // טעינה מחדש אפשרית, וגם מנהל האתר יכול למחוק
    expect((await call("/admin/groups/import", { admin: true, body: { group: "gizra", emails: ["a@x.co"] } })).data.members).toBe(1);
    expect((await call("/admin/groups/import", { admin: true, body: { group: "gizra", emails: [], mode: "replace" } })).data.members).toBe(0);
    // מי שאינו מנהל הקבוצה לא יכול
    const outsider = await managerToken("who@x.co");
    expect((await call("/group/import", { token: outsider, body: { group: "gizra", emails: [], mode: "replace" } })).status).toBe(403);
  });
});

// הצטרפות דרך הקישור (הכרעת בעלים 23.10.2026): נרשמת תמיד, נספרת רק אחרי שהמנהל מפעיל אחד משני המתגים
describe("members through the group link", () => {
  it("two switches, counted only when on, retroactively, and only for managers", async () => {
    await create();
    const boss = await managerToken();
    await call("/admin/groups/managers", { admin: true, body: { group: "gizra", email: "boss@x.co" } });
    const reg = async (email) => (await call("/auth/register", { body: { email, password: "a long pass phrase" } })).data.token;
    const old = await reg("old@x.co"), fresh = await reg("new@x.co");
    expect((await call("/group/link-join", { token: old, body: { slug: "hagzara" } })).status).toBe(200);
    expect((await call("/group/link-join", { token: fresh, body: { slug: "hagzara", first: true } })).status).toBe(200);
    expect((await call("/group/link-join", { token: old, body: { slug: "nope-nope" } })).status).toBe(404);
    expect((await call("/group/link-join", { body: { slug: "hagzara" } })).status).toBe(401);
    const ids = async (t) => (await call("/me", { token: t })).data.groups.map((g) => g.id);
    expect(await ids(old)).toEqual([]);
    const st = (await call("/group/link-members?group=gizra", { token: boss })).data;
    expect(st).toMatchObject({ all: { on: false, count: null }, first: { on: false, count: null }, list: null });
    expect(st.site).toBeGreaterThanOrEqual(3);
    expect((await call("/group/link-members", { token: old, body: { group: "gizra", flag: "first", on: true } })).status).toBe(403);
    expect((await call("/group/link-members", { token: boss, body: { group: "gizra", flag: "bogus", on: true } })).status).toBe(400);
    await call("/group/link-members", { token: boss, body: { group: "gizra", flag: "first", on: true } });
    expect(await ids(fresh)).toEqual(["gizra"]);
    expect(await ids(old)).toEqual([]);
    await call("/group/link-members", { token: boss, body: { group: "gizra", flag: "all", on: true } });
    expect(await ids(old)).toEqual(["gizra"]);
    await call("/group/link-members", { token: boss, body: { group: "gizra", flag: "all", on: false } });
    await call("/group/link-members", { token: boss, body: { group: "gizra", flag: "first", on: false } });
    expect(await ids(fresh)).toEqual([]);
  });
});
