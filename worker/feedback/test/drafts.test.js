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

it("טיוטה אינה מוצגת לגולש עד אישור, ואז מתפרסמת בנוסח הערוך", async () => {
  const { data: { token } } = await api("/", { topic: "theory", text: "[תאוריה או חישוב] בדיקה" });
  const id = env.DB.raw.prepare("SELECT id FROM feedback").get().id;
  env.DB.raw.prepare("INSERT INTO drafts (kind, target, created_at, text, reason) VALUES ('feedback', ?, ?, 'טיוטה', 'לא בטוח')").run(String(id), "2026-10-12T00:00:00Z");
  expect((await api(`/thread?t=${token}`)).data.messages).toEqual([]);
  const { data } = await api("/admin/data");
  expect(data.drafts.map(d => d.text)).toEqual(["טיוטה"]);
  expect((await api("/admin/draft/approve", { id: data.drafts[0].id, text: "נוסח סופי" })).data.ok).toBe(true);
  expect((await api(`/thread?t=${token}`)).data.messages.map(m => m.text)).toEqual(["נוסח סופי"]);
  expect((await api("/admin/data")).data.drafts).toEqual([]);
  expect(env.DB.raw.prepare("SELECT status FROM feedback").get().status).toBe("answered");
});

it("מחיקת טיוטה אינה מפרסמת דבר; בלי מפתח ניהול — נדחה", async () => {
  await api("/", { topic: "theory", text: "שאלה" });
  env.DB.raw.prepare("INSERT INTO drafts (kind, target, created_at, text) VALUES ('feedback', '1', ?, 'טיוטה')").run("2026-10-12T00:00:00Z");
  expect((await api("/admin/draft/delete", { id: 1 }, "b".repeat(40))).status).toBe(401);
  expect((await api("/admin/draft/delete", { id: 1 })).data.ok).toBe(true);
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM messages").get().n).toBe(0);
});

it("מפתח ה-AI נשמר מוצפן ולעולם אינו מוחזר", async () => {
  const key = "sk-test-" + "x".repeat(40);
  expect((await api("/admin/ai-key")).data).toMatchObject({ admin: null, server: false });
  expect((await api("/admin/ai-key", { key: "קצר" })).status).toBe(400);
  const saved = await api("/admin/ai-key", { key });
  expect(saved.data.admin.updated_at).toBeTruthy();
  expect(JSON.stringify(saved.data)).not.toContain(key);
  expect(env.DB.raw.prepare("SELECT value FROM settings").get().value).not.toContain("sk-test");
  expect((await api("/admin/ai-key", { key: null })).data.admin).toBe(null);
});

it("משתתף בהשהיה מוצג במסך הניהול ומשתחרר באישור", async () => {
  env.DB.raw.prepare("INSERT INTO held (kind, target, created_at, reason) VALUES ('feedback', '7', ?, 'חשד')").run("2026-10-12T00:00:00Z");
  expect((await api("/admin/data")).data.held.map(h => h.target)).toEqual(["7"]);
  expect((await api("/admin/release", { kind: "feedback", target: "7" }, "b".repeat(40))).status).toBe(401);
  await api("/admin/release", { kind: "feedback", target: "7" });
  expect((await api("/admin/data")).data.held).toEqual([]);
});

it("חסימה במאגר: תשובת צוות למשתתף בהשהיה הופכת לטיוטה בכל דרך, ואישור טיוטה עובר", async () => {
  const { data: { token } } = await api("/", { topic: "theory", text: "שאלה" });
  env.DB.raw.prepare("INSERT INTO held (kind, target, created_at) VALUES ('feedback', '1', ?)").run("2026-10-12T00:00:00Z");
  // כתיבה ישירה למאגר, כמו בסקירה המתוזמנת
  env.DB.raw.prepare("INSERT INTO messages (feedback_id, created_at, author, text) VALUES (1, ?, 'team', 'ישירה')").run("2026-10-12T01:00:00Z");
  env.DB.raw.prepare("UPDATE feedback SET status = 'answered' WHERE id = 1").run();
  // וגם ממסך הניהול
  await api("/admin/reply", { kind: "feedback", id: 1, text: "מהניהול" });
  expect((await api(`/thread?t=${token}`)).data.messages).toEqual([]);
  expect(env.DB.raw.prepare("SELECT status FROM feedback").get().status).toBe("new");
  const drafts = (await api("/admin/data")).data.drafts;
  expect(drafts.map(d => d.text)).toEqual(["ישירה", "מהניהול"]);
  await api("/admin/draft/approve", { id: drafts[0].id });
  expect((await api(`/thread?t=${token}`)).data.messages.map(m => m.text)).toEqual(["ישירה"]);
  expect(env.DB.raw.prepare("SELECT status FROM feedback").get().status).toBe("answered");
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM held_pass").get().n).toBe(0);
});

it("ריצה אחרונה של הסשן המרוכז מוחזרת במסך הניהול", async () => {
  expect((await api("/admin/data")).data.agentLastRun).toBe(null);
  env.DB.raw.prepare("INSERT INTO settings (name, value, updated_at) VALUES ('agent_last_run', ?1, ?1)").run("2026-10-12T11:05:00Z");
  expect((await api("/admin/data")).data.agentLastRun).toBe("2026-10-12T11:05:00Z");
});
