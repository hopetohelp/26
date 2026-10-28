import { beforeEach, expect, it } from "vitest";
import feedback from "../index.js";
import { fakeD1 } from "../../crowd/test/fakeD1.js";
import { sha256 } from "../../crowd/lib/crypto.js";

const admin = "a".repeat(40);
let env;
const api = async (path, body, auth = admin) => {
  const r = await feedback.fetch(new Request("https://w.example" + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  return { status: r.status, data: await r.json() };
};
beforeEach(async () => {
  env = { DB: fakeD1(new URL("../schema.sql", import.meta.url)), ALLOWED_ORIGIN: "https://x", IP_KEY: "secret" };
  await env.DB.prepare("INSERT INTO admin_keys (hash,created_at) VALUES (?,?)").bind(await sha256(admin), "2026-10-01").run();
});

it("מסכים מוסתרים: הקריאה פתוחה, השינוי רק למנהל, וערך לא חוקי נדחה", async () => {
  expect((await api("/screens", undefined, "")).data.screens).toEqual({});
  expect((await api("/admin/screens", { screens: { today: "all" } }, "b".repeat(40))).status).toBe(401);
  expect((await api("/admin/screens", { screens: { today: "maybe" } })).status).toBe(400);
  expect((await api("/admin/screens", { screens: { today: "all", guess: "admins" } })).data.screens).toEqual({ today: "all", guess: "admins" });
  expect((await api("/screens", undefined, "")).data.screens).toEqual({ today: "all", guess: "admins" });
});
