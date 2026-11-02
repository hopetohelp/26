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
/** חבר בגזרה — המייל המאומת ברשימת הקבוצה */
async function member(email, group = G) {
  const token = await account(email);
  env.DB.raw.prepare("INSERT INTO group_members (group_id, email_hash) VALUES (?, ?)").run(group, await emailHash(env, email));
  return token;
}
const setOutside = (outside, id = "reelect") => call("/survey/manage", { admin: true, body: { group: G, id, outside } });
const setSettings = (body, id = "reelect") => call("/survey/manage", { admin: true, body: { group: G, id, ...body } });
async function manager(email, group = G) {
  const token = await account(email);
  env.DB.raw.prepare("INSERT INTO group_managers (group_id, email_hash, added_at) VALUES (?, ?, 't')").run(group, await emailHash(env, email));
  return token;
}
const op = () => `op-${String(++opN).padStart(6, "0")}`;
const answer = (token, answers, survey = "reelect") => call("/survey/answer", { token, body: { survey, op: op(), answers } });

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
  it("the government survey is split into three; members see all, outsiders nothing by default", async () => {
    expect((await call("/surveys")).data.surveys).toEqual([]);
    expect((await call("/survey?id=reelect")).status).toBe(404);
    const m = await member("in@x.co");
    const r = await call("/surveys", { token: m });
    expect(r.data.surveys.map((s) => s.id)).toEqual(["gov", "reelect", "president", "vote", "vote2022"]);
    expect(r.data.surveys.map((s) => s.kind)).toEqual(["guess", "guess", "guess", "survey", "survey"]);
    expect(r.data.surveys.map((s) => s.questions.map((q) => q.id))).toEqual([["coalition"], ["reelect"], ["first"], ["vote"], ["vote2022"]]);
    expect(r.data.surveys[0].questions[0].items.reduce((n, i) => n + i.seats, 0)).toBe(120);
    expect(r.data.surveys[1]).toMatchObject({ canAnswer: true, kind: "guess", visibility: "answered", minResults: SURVEY_MIN, closesAt: null });
  });

  it("outsiders: view shows survey without answering; answer lets them take part", async () => {
    const out = await account("out@x.co");
    expect((await answer(out, { reelect: "yes" })).status).toBe(403);
    expect((await setOutside("view")).status).toBe(200);
    const v = await call("/survey?id=reelect", { token: out });
    expect(v.data.access.canAnswer).toBe(false);
    expect((await answer(out, { reelect: "yes" })).status).toBe(403);
    await setOutside("answer");
    expect((await call("/survey?id=reelect", { token: out })).data.results).toBeNull();
    expect((await answer(out, { reelect: "yes" })).status).toBe(200);
    expect((await call("/survey?id=reelect", { token: out })).data.results.all.n).toBe(1);
    await setOutside("none");
    expect((await call("/survey?id=reelect", { token: out })).status).toBe(404);
    expect((await setOutside("everyone")).status).toBe(400);
  });

  it("keeps every answer as history and returns the latest as mine", async () => {
    const token = await member("a@x.co");
    expect((await answer(token, { reelect: "no" })).status).toBe(200);
    t += 60_000;
    expect((await answer(token, { reelect: "yes" })).status).toBe(200);
    expect((await answer(token, { coalition: { likud: "coalition", raam: { abstain: 3 } } }, "gov")).status).toBe(200);
    const h = await call("/survey/history", { token });
    expect(h.data.answers.filter((a) => a.survey === "reelect").map((a) => a.answers.reelect)).toEqual(["yes", "no"]);
    expect((await call("/survey?id=reelect", { token })).data.mine.answers.reelect).toBe("yes");
  });

  it("does not duplicate a resent answer and rejects invalid ones", async () => {
    const token = await member("b@x.co");
    const body = { survey: "reelect", op: "same-op-123", answers: { reelect: "yes" } };
    await call("/survey/answer", { token, body });
    await call("/survey/answer", { token, body });
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM survey_answers").get().n).toBe(1);
    expect((await answer(token, { reelect: "maybe" })).status).toBe(400);
    expect((await answer(token, { coalition: { likud: "king" } }, "gov")).status).toBe(400);
    expect((await call("/survey/answer", { body: { survey: "reelect", op: op(), answers: { reelect: "yes" } } })).status).toBe(401);
  });

  it("results threshold: default 50, and the manager can set another", async () => {
    const one = await member("c@x.co");
    expect((await call("/survey?id=reelect", { token: one })).data.results).toBeNull();
    await answer(one, { reelect: "yes" });
    let r = await call("/survey?id=reelect", { token: one });
    expect(r.data.results.all).toEqual({ n: 1, min: SURVEY_MIN, hidden: true });
    expect((await setSettings({ min_results: 1 })).status).toBe(200);
    r = await call("/survey?id=reelect", { token: one });
    expect(r.data.results.all.questions.reelect.counts).toEqual({ yes: 1, no: 0 });
    expect((await setSettings({ min_results: 0 })).status).toBe(400);
  });

  it("visibility: everyone now / after close / only who answered", async () => {
    const m = await member("v@x.co");
    await setSettings({ min_results: 1 });
    expect((await call("/survey?id=reelect", { token: m })).data.results).toBeNull();
    await setSettings({ visibility: "now" });
    expect((await call("/survey?id=reelect", { token: m })).data.results).not.toBeNull();
    await setSettings({ visibility: "after_close" });
    expect((await call("/survey?id=reelect", { token: m })).data.results).toBeNull();
    await setSettings({ status: "closed" });
    expect((await call("/survey?id=reelect", { token: m })).data.results).not.toBeNull();
    expect((await setSettings({ visibility: "sometimes" })).status).toBe(400);
  });

  it("deadline: after it the survey counts as closed and refuses answers", async () => {
    const m = await member("dl@x.co");
    await setSettings({ closes_at: new Date(t + 3600_000).toISOString() });
    expect((await answer(m, { reelect: "yes" })).status).toBe(200);
    t += 2 * 3600_000;
    expect((await answer(m, { reelect: "no" })).status).toBe(403);
    expect((await call("/survey?id=reelect", { token: m })).data.survey.status).toBe("closed");
    await setSettings({ closes_at: null });
    expect((await answer(m, { reelect: "no" })).status).toBe(200);
  });

  it("guess: the manager sets the true result, shown to viewers", async () => {
    const m = await member("g1@x.co");
    await setSettings({ kind: "guess", truth: { reelect: "no" } });
    const r = await call("/survey?id=reelect", { token: m });
    expect(r.data.survey).toMatchObject({ kind: "guess", truth: { reelect: "no" } });
    expect((await setSettings({ truth: { reelect: "maybe" } })).status).toBe(400);
    expect((await setSettings({ truth: { coalition: {} } }, "gov")).status).toBe(400);
  });

  it("new surveys: options or range only — no list assignment", async () => {
    const m = await manager("nm@x.co");
    const rangeDef = { title: "כמה", questions: [{ id: "r", kind: "range", title: "מ-1 עד 10", min: 1, max: 10, minLabel: "בכלל לא", maxLabel: "מאוד" }] };
    expect((await call("/survey/manage", { token: m, body: { group: G, id: "scale", def: rangeDef, status: "open" } })).status).toBe(200);
    const mem = await member("rm@x.co");
    expect((await answer(mem, { r: 7 }, "scale")).status).toBe(200);
    expect((await answer(mem, { r: 11 }, "scale")).status).toBe(400);
    const assignDef = { title: "שיוך", questions: [{ id: "c", kind: "assign", title: "t", items: [{ id: "a", label: "א" }, { id: "b", label: "ב" }], columns: [{ id: "x", label: "x" }, { id: "y", label: "y" }] }] };
    expect((await call("/survey/manage", { token: m, body: { group: G, id: "assign-new", def: assignDef } })).data.error).toBe("assign_not_allowed");
    // בסקר "הרכבת הממשלה" — עריכת שאלת השיוך הקיימת מותרת
    const gov = (await call("/survey?id=gov", { token: m })).data.survey;
    expect((await call("/survey/manage", { token: m, body: { group: G, id: "gov", def: { title: gov.title, questions: gov.questions } } })).status).toBe(200);
  });

  it("stats for managers: views, viewers, embed, saves, savers, members, changed", async () => {
    const m = await manager("st@x.co");
    const a = await member("s1@x.co");
    await call("/survey/view", { token: a, body: { survey: "reelect" } });
    await call("/survey/view", { token: a, body: { survey: "reelect" } });
    await call("/survey/view", { body: { survey: "reelect", embed: true } });
    await answer(a, { reelect: "yes" }); t += 1000; await answer(a, { reelect: "no" });
    const s = await call("/survey/stats?id=reelect", { token: m });
    expect(s.data).toMatchObject({ views: 3, viewers: 2, embedViews: 1, saves: 2, savers: 1, changed: 1, members: 1, outsiders: 0 });
    expect(s.data.days.length).toBeGreaterThan(0);
    expect((await call("/survey/stats?id=reelect", { token: a })).status).toBe(403);
  });

  it("shows results to a group manager who did not answer", async () => {
    const m = await manager("mr@x.co");
    expect((await call("/survey?id=reelect", { token: m })).data.results.all.hidden).toBe(true);
  });

  it("gives group managers full control over their group's surveys only", async () => {
    const m = await manager("m@x.co");
    const def = { title: "סקר חדש", questions: [{ id: "q", kind: "single", title: "שאלה", options: [{ id: "a", label: "א" }, { id: "b", label: "ב" }] }] };
    let r = await call("/survey/manage", { token: m, body: { group: G, id: "new-one", def } });
    expect(r.data.survey.status).toBe("draft");
    expect((await call("/surveys", { token: await member("g@x.co") })).data.surveys.map((s) => s.id)).not.toContain("new-one");
    expect((await call("/surveys", { token: m })).data.surveys.map((s) => s.id)).toContain("new-one");
    r = await call("/survey/manage", { token: m, body: { group: G, id: "new-one", status: "open" } });
    expect(r.data.survey.status).toBe("open");
    await call("/survey/manage", { token: m, body: { group: G, id: "reelect", status: "closed" } });
    expect((await answer(await member("d@x.co"), { reelect: "yes" })).status).toBe(403);
    expect((await call("/survey/manage", { token: m, body: { group: G, id: "new-one", delete: true } })).status).toBe(400);
    expect((await call("/survey/manage", { token: m, body: { group: G, id: "new-one", delete: true, confirm: "מחק" } })).status).toBe(200);
    const other = await manager("o@x.co", "other");
    expect((await call("/survey/manage", { token: other, body: { group: "other", id: "gov", status: "open" } })).status).toBe(403);
    expect((await call("/survey/manage", { token: other, body: { group: G, id: "gov", status: "open" } })).status).toBe(403);
    expect((await call("/survey/manage", { token: await account("e@x.co"), body: { group: G, id: "gov", status: "open" } })).status).toBe(403);
    expect((await call("/survey/manage", { admin: true, body: { group: G, id: "gov", status: "open" } })).data.survey.status).toBe("open");
  });

  it("only the site admin can remove a group manager", async () => {
    const m = await manager("m2@x.co");
    const handle = await emailHash(env, "m2@x.co");
    expect((await call("/admin/groups/managers", { token: m, body: { group: G, remove: true, handle } })).status).toBe(401);
    expect((await call("/admin/groups/managers", { admin: true, body: { group: G, remove: true, handle } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM group_managers WHERE group_id = ?").get(G).n).toBe(0);
  });

  it("clearing history and deleting the account remove survey answers", async () => {
    const token = await member("f@x.co");
    await answer(token, { reelect: "yes" });
    expect((await call("/history/clear", { token, body: { confirm: "מחק" } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM survey_answers").get().n).toBe(0);
    await answer(token, { reelect: "no" });
    expect((await call("/delete", { token, body: { confirm: "מחק" } })).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM survey_answers").get().n).toBe(0);
  });
});
