import { beforeEach, expect, it, vi } from "vitest";
import feedback from "../index.js";
import crowd from "../../crowd/index.js";
import { fakeD1 } from "../../crowd/test/fakeD1.js";
import { sha256 } from "../../crowd/lib/crypto.js";

let env, accounts, token, participant;
let n = 0;
/** חשבון חדש (מייל + סיסמה) ⇐ אסימון סשן */
const newAccount = async () => (await request(crowd, accounts, "/auth/register", { email: `user${n++}@example.com`, password: "a fine password 1" })).data.token;
const admin = "a".repeat(40);
const origin = "https://hopetohelp.github.io";
async function request(worker, environment, path, body, authorization) {
  const response = await worker.fetch(new Request("https://w.example" + path, {
    method: body === undefined ? "GET" : "POST", headers: { origin, "content-type": "application/json", ...(authorization ? { authorization: `Bearer ${authorization}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), environment);
  return { status: response.status, data: await response.json() };
}
const api = (path, body, auth) => request(feedback, env, path, body, auth);
const support = (body = {}, auth = token) => api("/", { kind: "account-support", token: auth, ...body });
beforeEach(async () => {
  env = { DB: fakeD1(new URL("../schema.sql", import.meta.url)), ALLOWED_ORIGIN: origin };
  accounts = { DB: fakeD1(), ALLOWED_ORIGIN: origin, IP_KEY: "secret", DATA_KEY: "data" };
  env.CROWD = { fetch: vi.fn(req => crowd.fetch(req, accounts)) };
  accounts.FEEDBACK = { fetch: req => feedback.fetch(req, env) };
  token = await newAccount();
  participant = (await request(crowd, accounts, "/me", undefined, token)).data.participant;
  for (const database of [env.DB, accounts.DB]) await database.prepare("INSERT INTO admin_keys (hash,created_at) VALUES (?,?)").bind(await sha256(admin), "2026-10-01").run();
});
function legacy() {
  accounts.DB.raw.prepare("INSERT INTO support_threads VALUES (?,?,?,'answered')").run(participant,"2026-10-01T10:00:00Z","2026-10-01T11:00:00Z");
  accounts.DB.raw.prepare("INSERT INTO support_messages (participant,created_at,author,text) VALUES (?,?,?,?)").run(participant,"2026-10-01T10:00:00Z","visitor","שאלה ישנה");
  accounts.DB.raw.prepare("INSERT INTO support_messages (participant,created_at,author,text) VALUES (?,?,?,?)").run(participant,"2026-10-01T11:00:00Z","team","תשובה ישנה");
}
it("מעתיק היסטוריה בלי כפילויות ושומר הודעות חדשות רק בשרת ההערות", async () => {
  legacy();
  expect((await support()).data.thread.messages.map(m => m.text)).toEqual(["שאלה ישנה","תשובה ישנה"]);
  await support();
  const body = { text: "[רעיון] חדש", op_id: "operation-123456789" };
  await support(body); await support(body);
  expect((await support()).data.thread.messages.map(m => m.text)).toEqual(["שאלה ישנה","תשובה ישנה","[רעיון] חדש"]);
  expect(accounts.DB.raw.prepare("SELECT COUNT(*) AS n FROM support_messages").get().n).toBe(2);
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM support_messages").get().n).toBe(3);
});
it("מענה בניהול אינו תלוי בשרת החשבונות; העתקה חוזרת לא דורסת את התשובה", async () => {
  legacy();
  const data = (await api("/admin/data",undefined,admin)).data;
  expect(data.support.threads[0].messages).toHaveLength(2);
  const service = env.CROWD;
  env.CROWD = { fetch: async () => { throw new Error("offline"); } };
  expect((await api("/admin/reply",{kind:"support",id:participant,text:"תשובה חדשה"},admin)).status).toBe(200);
  const offline = (await api("/admin/data",undefined,admin)).data;
  expect(offline.support.threads[0].messages.at(-1).text).toBe("תשובה חדשה");
  expect(offline.accountStatsAvailable).toBe(false);
  env.CROWD = service;
  expect((await support()).data.thread.status).toBe("answered");
  expect((await support()).data.thread.messages).toHaveLength(3);
});
it("אימות חשבון חובה וכל חשבון רואה רק את השיחה שלו", async () => {
  expect((await support({text:"לא מורשה",op_id:"operation-123456789"},"invalid")).status).toBe(401);
  await support({text:"פרטי",op_id:"operation-123456789"});
  const other = await newAccount();
  expect((await support({},other)).data.thread).toBe(null);
  expect((await api("/admin/reply",{kind:"support",id:participant,text:"אסור"},"invalid")).status).toBe(401);
});
it("נתיבי התמיכה הישנים מעבירים כתיבה וקריאה לשרת ההערות", async () => {
  const old = await request(crowd,accounts,"/support",{text:"מביקור ישן"},token);
  expect(old.status).toBe(200);
  expect((await request(crowd,accounts,"/support",undefined,token)).data.thread.messages[0].text).toBe("מביקור ישן");
  expect(accounts.DB.raw.prepare("SELECT COUNT(*) AS n FROM support_messages").get().n).toBe(0);
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM support_messages").get().n).toBe(1);
});
it("שרת החשבונות הישן נתמך בזמן פריסה מדורגת", async () => {
  legacy();
  env.CROWD = { fetch: req => {
    const path = new URL(req.url).pathname;
    if(path === "/support/access") return Promise.resolve(new Response('{"error":"not_found"}',{status:404}));
    if(path === "/support") return Promise.resolve(new Response(JSON.stringify({thread:{status:"answered",created_at:"2026-10-01T10:00:00Z",updated_at:"2026-10-01T11:00:00Z",messages:[{author:"visitor",text:"שאלה ישנה",created_at:"2026-10-01T10:00:00Z"},{author:"team",text:"תשובה ישנה",created_at:"2026-10-01T11:00:00Z"}]}})));
    return crowd.fetch(req,accounts);
  }};
  expect((await support()).data.thread.messages).toHaveLength(2);
  env.CROWD = {fetch:req=>crowd.fetch(req,accounts)};
  expect((await support()).data.thread.messages).toHaveLength(2);
});
it("כשל אימות פנימי מדווח כשגיאה, בלי אישור שמירה מדומה", async () => {
  env.CROWD = { fetch: async () => { throw new Error("offline"); } };
  expect((await support({text:"חדש",op_id:"operation-123456789"})).status).toBe(503);
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM support_messages").get().n).toBe(0);
});
it("פנייה שנפתחה בלי חשבון מאוחדת לשיחת החשבון בהרשמה; מחיקת החשבון מוחקת את כל השיחה", async () => {
  const note = await api("/", { topic: "other", text: "שאלה בלי חשבון", page: "/support" });
  expect(note.data.token).toBeTruthy();
  await support({ text: "הודעה מהחשבון", op_id: "operation-adopt-0001" });
  const merged = (await support({ adopt: [note.data.token, "no-such-thread"] })).data.thread.messages.map(m => m.text);
  expect(merged).toEqual(["שאלה בלי חשבון", "הודעה מהחשבון"]);
  await support({ adopt: [note.data.token] });
  expect((await support()).data.thread.messages).toHaveLength(2);
  const admin_ = (await api("/admin/data", undefined, admin)).data;
  expect(admin_.feedback.find(t => t.items.some(i => i.text === "שאלה בלי חשבון"))).toBeUndefined();
  expect((await request(crowd, accounts, "/delete", { confirm: "מחק" }, token)).status).toBe(200);
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM support_messages").get().n).toBe(0);
  expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback").get().n).toBe(0);
});

it("חשבון מנהל נכנס לממשק הניהול של שרת ההערות בלי מפתח; חשבון רגיל נדחה", async () => {
  expect((await api("/admin/data", undefined, token)).status).toBe(401);
  accounts.DB.raw.prepare("INSERT INTO admins (participant, added_at) VALUES (?, ?)").run(participant, "x");
  const r = await api("/admin/data", undefined, token);
  expect(r.status).toBe(200);
  expect(r.data.ok).toBe(true);
  const guesses = await api("/admin/guesses", undefined, token);
  expect(guesses.status).toBe(200);
  expect((await api("/admin/data", undefined, "x".repeat(43))).status).toBe(401);
});
