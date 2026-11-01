import { describe, it, expect, beforeEach } from "vitest";
import worker from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { sha256 } from "../lib/crypto.js";
import { emailHash } from "../lib/identity.js";
import { cleanDefinition, cleanAnswers, tally, SURVEY_MIN } from "../lib/surveys.js";

// סקרי האתר (הכרעת בעלים 01.11.2026): תשובות עם היסטוריה מלאה, שליטה מלאה למנהלי הקבוצה, סף פרסום
const KEY = "k".repeat(40);
const G = "gy7lelpbo";
let env, t, ipN = 0, opN = 0;
beforeEach(async () => {
  t = Date.parse("2026-11-01T12:00:00Z");
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: "https://hopetohelp.github.io/26/", IP_KEY: "ip-secret", DATA_KEY: "data-secret", NOW: () => t };
  await env.DB.prepare("INSERT INTO admin_keys (hash, created_at) VALUES (?, ?)").bind(await sha256(KEY), "x").run();
  env.DB.raw.prepare("INSERT INTO groups (id, name_enc, created_at) VALUES (?, 'x', 't'), ('other', 'x', 't')").run(G);
});
const call = async (path, { body, token, admin } = {}) => {
  const res = await worker.fetch(new Request("https://w.example" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.7.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { "x-admin-key": KEY } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: res.status, data: await res.json().catch(() => null) };
};
async function account(email) {
  const r = await call("/auth/register", { body: { email, password: "a long pass phrase" } });
  env.DB.raw.prepare("UPDATE emails SET verified = 1 WHERE participant = (SELECT participant FROM sessions WHERE token_hash = ?)").run(await sha256(r.data.token));
  return r.data.token;
}
async function manager(email, group = G) {
  const token = await account(email);
  env.DB.raw.prepare("INSERT INTO group_managers (group_id, email_hash, added_at) VALUES (?, ?, 't')").run(group, await emailHash(env, email));
  return token;
}
const op = () => `op-${String(++opN).padStart(6, "0")}`;
const answer = (token, answers, survey = "gov") => call("/survey/answer", { token, body: { survey, op: op(), answers } });

describe("survey definitions and answers (pure)", () => {
  const def = cleanDefinition({ title: "ס", questions: [
    { id: "q1", kind: "single", title: "כן או לא", options: [{ id: "yes", label: "כן" }, { id: "no", label: "לא" }] },
    { id: "q2", kind: "assign", title: "שיוך", items: [{ id: "a", label: "א", seats: 10 }, { id: "b", label: "ב" }], columns: [{ id: "c", label: "ק" }, { id: "o", label: "א" }] },
  ] });
  it("rejects bad definitions", () => {
    expect(def).not.toBeNull();
    expect(cleanDefinition({ title: "x", questions: [] })).toBeNull();
    expect(cleanDefinition({ title: "x", questions: [{ id: "q", kind: "single", title: "t", options: [{ id: "a", label: "א" }] }] })).toBeNull();
    expect(cleanDefinition({ title: "x", questions: [{ id: "q", kind: "poll", title: "t", options: [] }] })).toBeNull();
  });
  it("accepts only known options, items and columns", () => {
    expect(cleanAnswers(def, { q1: "yes", q2: { a: "c" } })).toEqual({ q1: "yes", q2: { a: "c" } });
    expect(cleanAnswers(def, { q1: "maybe" })).toBeNull();
    expect(cleanAnswers(def, { q2: { z: "c" } })).toBeNull();
    expect(cleanAnswers(def, { q3: "yes" })).toBeNull();
    expect(cleanAnswers(def, {})).toBeNull();
    // פיצול סיעה
    expect(cleanAnswers(def, { q2: { a: { c: 6, o: 4 } } })).toEqual({ q2: { a: { c: 6, o: 4 } } });
    expect(cleanAnswers(def, { q2: { a: { c: 0, o: 3 } } })).toEqual({ q2: { a: { o: 3 } } });
    expect(cleanAnswers(def, { q2: { a: { z: 2 } } })).toBeNull();
    expect(cleanAnswers(def, { q2: { a: { c: 1.5 } } })).toBeNull();
    expect(cleanAnswers(def, { q2: { a: { c: 0 } } })).toBeNull();
  });
  it("tallies the latest answers", () => {
    const r = tally(def, [{ q1: "yes", q2: { a: "c", b: "o" } }, { q1: "no" }, { q2: { a: "o" } }]);
    expect(r.q1).toEqual({ n: 2, counts: { yes: 1, no: 1 } });
    expect(r.q2.n).toBe(2);
    expect(r.q2.items.a).toEqual({ c: 1, o: 1 });
    expect(tally(def, [{ q2: { a: { c: 3, o: 1 } } }]).q2.items.a).toEqual({ c: 0.75, o: 0.25 });
  });
});

describe("site surveys over the worker", () => {
  it("lists the seeded government-formation survey to everyone", async () => {
    const r = await call("/surveys");
    expect(r.status).toBe(200);
    expect(r.data.surveys.map((s) => s.id)).toEqual(["gov"]);
    expect(r.data.surveys[0].questions.map((q) => q.id)).toEqual(["reelect", "first", "coalition"]);
    expect(r.data.surveys[0].questions[2].items.reduce((n, i) => n + i.seats, 0)).toBe(120);
  });

  it("keeps every answer as history and returns the latest as mine", async () => {
    const token = await account("a@x.co");
    expect((await answer(token, { reelect: "no" })).status).toBe(200);
    t += 60_000;
    expect((await answer(token, { reelect: "yes", first: "netanyahu", coalition: { likud: "coalition", raam: "abstain" } })).status).toBe(200);
    const h = await call("/survey/history", { token });
    expect(h.data.answers.map((a) => a.answers.reelect)).toEqual(["yes", "no"]);
    expect(h.data.surveys.map((s) => s.id)).toEqual(["gov"]);
    const s = await call("/survey?id=gov", { token });
    expect(s.data.mine.answers.first).toBe("netanyahu");
    expect((await call("/surveys", { token })).data.surveys[0].answered).toBe(true);
  });

  it("does not duplicate a resent answer and rejects invalid ones", async () => {
    const token = await account("b@x.co");
    const body = { survey: "gov", op: "same-op-123", answers: { reelect: "yes" } };
    await call("/survey/answer", { token, body });
    await call("/survey/answer", { token, body });
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM survey_answers").get().n).toBe(1);
    expect((await answer(token, { reelect: "maybe" })).status).toBe(400);
    expect((await answer(token, { coalition: { likud: "king" } })).status).toBe(400);
    expect((await call("/survey/answer", { body: { survey: "gov", op: op(), answers: { reelect: "yes" } } })).status).toBe(401);
  });

  it("hides results below the threshold and publishes them above it", async () => {
    const one = await account("c@x.co");
    // לפני שענית — אין תוצאות
    expect((await call("/survey?id=gov", { token: one })).data.results).toBeNull();
    expect((await call("/survey?id=gov")).data.results).toBeNull();
    await answer(one, { reelect: "yes" });
    let r = await call("/survey?id=gov", { token: one });
    expect(r.data.results.all).toEqual({ n: 1, min: SURVEY_MIN, hidden: true });
    for (let i = 0; i < SURVEY_MIN; i++) env.DB.raw.prepare("INSERT INTO participants (id, created_at) VALUES (?, 't')").run(`p${i}`);
    for (let i = 0; i < SURVEY_MIN; i++) env.DB.raw.prepare("INSERT INTO survey_answers (survey, participant, created_at, op_id, payload) VALUES ('gov', ?, 't', ?, ?)").run(`p${i}`, `o${i}`, JSON.stringify({ reelect: i % 2 ? "yes" : "no" }));
    r = await call("/survey?id=gov", { token: one });
    expect(r.data.results.all.n).toBe(SURVEY_MIN + 1);
    expect(r.data.results.all.questions.reelect.counts).toEqual({ yes: SURVEY_MIN / 2 + 1, no: SURVEY_MIN / 2 });
    // משתתפי הקבוצה: אף אחד מהם אינו חבר ⇐ מתחת לסף
    expect(r.data.results.group.hidden).toBe(true);
  });

  it("shows results to a group manager who did not answer", async () => {
    const m = await manager("mr@x.co");
    expect((await call("/survey?id=gov", { token: m })).data.results.all.hidden).toBe(true);
  });

  it("gives group managers full control over their group's surveys only", async () => {
    const m = await manager("m@x.co");
    const def = { title: "סקר חדש", questions: [{ id: "q", kind: "single", title: "שאלה", options: [{ id: "a", label: "א" }, { id: "b", label: "ב" }] }] };
    let r = await call("/survey/manage", { token: m, body: { group: G, id: "new-one", def } });
    expect(r.data.survey.status).toBe("draft");
    // טיוטה — גלויה רק למנהל
    expect((await call("/surveys")).data.surveys.map((s) => s.id)).toEqual(["gov"]);
    expect((await call("/surveys", { token: m })).data.surveys.map((s) => s.id)).toContain("new-one");
    r = await call("/survey/manage", { token: m, body: { group: G, id: "new-one", status: "open" } });
    expect(r.data.survey.status).toBe("open");
    // סגירה חוסמת תשובות
    await call("/survey/manage", { token: m, body: { group: G, id: "gov", status: "closed" } });
    expect((await answer(await account("d@x.co"), { reelect: "yes" })).status).toBe(403);
    // מחיקה מחייבת אישור
    expect((await call("/survey/manage", { token: m, body: { group: G, id: "new-one", delete: true } })).status).toBe(400);
    expect((await call("/survey/manage", { token: m, body: { group: G, id: "new-one", delete: true, confirm: "מחק" } })).status).toBe(200);
    // מנהל של קבוצה אחרת, או משתמש רגיל — לא
    const other = await manager("o@x.co", "other");
    expect((await call("/survey/manage", { token: other, body: { group: "other", id: "gov", status: "open" } })).status).toBe(403);
    expect((await call("/survey/manage", { token: other, body: { group: G, id: "gov", status: "open" } })).status).toBe(403);
    expect((await call("/survey/manage", { token: await account("e@x.co"), body: { group: G, id: "gov", status: "open" } })).status).toBe(403);
    // מנהל האתר — תמיד
    expect((await call("/survey/manage", { admin: true, body: { group: G, id: "gov", status: "open" } })).data.survey.status).toBe("open");
  });

  it("only the site admin can remove a group manager", async () => {
    const m = await manager("m2@x.co");
    const handle = await emailHash(env, "m2@x.co");
    // אין נתיב שבו מנהל קבוצה מסיר מנהל; נתיב ההסרה דורש מנהל אתר
    expect((await call("/admin/groups/managers", { token: m, body: { group: G, remove: true, handle } })).status).toBe(401);
    expect((await call("/admin/groups/managers", { admin: true, body: { group: G, remove: true, handle } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM group_managers WHERE group_id = ?").get(G).n).toBe(0);
  });

  it("clearing history and deleting the account remove survey answers", async () => {
    const token = await account("f@x.co");
    await answer(token, { reelect: "yes" });
    expect((await call("/history/clear", { token, body: { confirm: "מחק" } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM survey_answers").get().n).toBe(0);
    await answer(token, { reelect: "no" });
    expect((await call("/delete", { token, body: { confirm: "מחק" } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM survey_answers").get().n).toBe(0);
  });
});
