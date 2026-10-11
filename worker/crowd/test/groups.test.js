import { describe, it, expect, beforeEach } from "vitest";
import worker, { GROUP_CHUNK } from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { sha256 } from "../lib/crypto.js";
import { emailHash, normalizeEmail } from "../lib/identity.js";

const KEY = "k".repeat(40);
let env;
beforeEach(async () => {
  env = { DB: fakeD1(), IP_KEY: "ip-key", DATA_KEY: "data-key", ALLOWED_ORIGINS: "https://site.example", CLOCK: String(Date.parse("2026-10-11T12:00:00Z")) };
  await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
});
const req = (path, body, key = KEY) =>
  worker
    .fetch(new Request("https://w.example" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(key ? { "x-admin-key": key } : {}) }, body: body ? JSON.stringify(body) : undefined }), env)
    .then(async (r) => ({ status: r.status, data: await r.json() }));

describe("group member lists", () => {
  it("requires an admin", async () => {
    expect((await req("/admin/groups/import", { group: "g1", name: "הגזרה", emails: [] }, null)).status).toBe(401);
    expect((await req("/admin/groups", undefined, null)).status).toBe(401);
  });

  it("stores only hashes matching account email hashes, normalized", async () => {
    const r = await req("/admin/groups/import", { group: "g1", name: "הגזרה", emails: ["A.B+x@Gmail.com", "ab@gmail.com", "c@d.co", "bad", "c@d.co"] });
    expect(r.data).toEqual({ group: "g1", added: 2, duplicates: 2, invalid: 1, members: 2 });
    const { results } = await env.DB.prepare("SELECT email_hash FROM group_members").all();
    const expected = await emailHash(env, normalizeEmail("ab@gmail.com").norm);
    expect(results.map((x) => x.email_hash)).toContain(expected);
    // אין מייל גלוי במאגר
    const dump = JSON.stringify((await env.DB.prepare("SELECT * FROM group_members").all()).results) + JSON.stringify((await env.DB.prepare("SELECT * FROM groups").all()).results);
    expect(dump).not.toMatch(/@|הגזרה/);
  });

  it("adds in chunks, replaces, lists and deletes", async () => {
    await req("/admin/groups/import", { group: "g1", name: "הגזרה", emails: ["a@x.co"] });
    expect((await req("/admin/groups/import", { group: "g1", emails: ["b@x.co", "a@x.co"] })).data).toMatchObject({ added: 1, duplicates: 1, members: 2 });
    expect((await req("/admin/groups/import", { group: "g1", emails: ["z@x.co"], mode: "replace" })).data).toMatchObject({ added: 1, members: 1 });
    expect((await req("/admin/groups")).data.groups).toEqual([{ id: "g1", name: "הגזרה", members: 1, createdAt: expect.any(String) }]);
    expect((await req("/admin/groups/delete", { group: "g1" })).status).toBe(200);
    expect((await req("/admin/groups")).data.groups).toEqual([]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members").first()).n).toBe(0);
  });

  it("rejects bad input", async () => {
    expect((await req("/admin/groups/import", { group: "Bad Id", name: "x", emails: [] })).data.error).toBe("group");
    expect((await req("/admin/groups/import", { group: "g2", emails: ["a@x.co"] })).data.error).toBe("name");
    expect((await req("/admin/groups/import", { group: "g2", name: "x", emails: Array(GROUP_CHUNK + 1).fill("a@x.co") })).status).toBe(400);
    expect((await req("/admin/groups/import", { group: "g2", name: "x", emails: [], mode: "wipe" })).data.error).toBe("mode");
  });

  it("a full chunk of long emails fits the request size limit", async () => {
    const emails = Array.from({ length: GROUP_CHUNK }, (_, i) => `firstname.lastname${i}@example-domain.co.il`);
    expect((await req("/admin/groups/import", { group: "g3", name: "x", emails })).data.members).toBe(GROUP_CHUNK);
  });
});
