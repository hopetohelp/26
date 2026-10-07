import { beforeEach, describe, expect, it } from "vitest";
import worker from "../index.js";
import { fakeD1 } from "../../crowd/test/fakeD1.js";

let env;
beforeEach(() => { env = { DB: fakeD1(new URL("../schema.sql", import.meta.url)), ALLOWED_ORIGIN: "https://hopetohelp.github.io" }; });
async function call(path, body) {
  const response = await worker.fetch(new Request("https://w.example" + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { status: response.status, data: await response.json() };
}
async function note(text) { return (await call("/", { text, topic: "design" })).data.token; }
const thread = (t) => call("/thread?t=" + t);
const merge = (...tokens) => call("/merge", { tokens });

describe("איחוד שיחות בבעלות מוכחת", () => {
  it("preserves every note, reply and old link; repeated merge does not duplicate", async () => {
    const a = await note("ראשונה"), b = await note("שנייה");
    await call("/thread", { t: b, text: "תוספת לשנייה" });
    env.DB.raw.prepare("INSERT INTO messages (feedback_id, created_at, author, text) VALUES (2, ?, 'team', ?)").run(new Date().toISOString(), "תשובת צוות");
    expect((await merge(b, a)).data.ok).toBe(true);
    const one = (await thread(a)).data, two = (await thread(b)).data;
    expect(two).toEqual(one);
    expect(one.text).toBe("ראשונה");
    expect(one.messages.map((m) => m.text)).toEqual(["שנייה", "תוספת לשנייה", "תשובת צוות"]);
    expect(one.messages.at(-1).author).toBe("team");
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback").get().n).toBe(2);
    await merge(a, b);
    expect((await thread(b)).data).toEqual(one);
    await call("/thread", { t: b, text: "אחרי האיחוד" });
    expect((await thread(a)).data.messages.at(-1).text).toBe("אחרי האיחוד");
  });
  it("merges overlapping groups transitively and leaves unrelated conversations private", async () => {
    const a = await note("א"), b = await note("ב"), c = await note("ג"), other = await note("אחר");
    await merge(a, b);
    await merge(c, b);
    for (const t of [a, b, c]) expect((await thread(t)).data.messages.map((m) => m.text)).toEqual(["ב", "ג"]);
    expect((await thread(other)).data.messages).toEqual([]);
  });
  it("rejects a missing ownership token without partial changes", async () => {
    const a = await note("א"), b = await note("ב");
    expect((await merge(a, b, "abcdefghijklmnopqrstuv")).status).toBe(404);
    expect((await thread(a)).data.messages).toEqual([]);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback_threads").get().n).toBe(0);
    expect((await merge(a, "<invalid>")).status).toBe(400);
  });
  it("keeps status on the canonical conversation, even after another merge request", async () => {
    const a = await note("א"), b = await note("ב");
    env.DB.raw.exec("UPDATE feedback SET status = 'answered' WHERE id = 1");
    await merge(a, b);
    expect((await thread(a)).data.status).toBe("new");
    env.DB.raw.exec("UPDATE feedback SET status = 'answered' WHERE id = 1");
    await merge(a, b);
    expect((await thread(b)).data.status).toBe("answered");
  });
  it("keeps the daily send limit after merging", async () => {
    const a = await note("א"), b = await note("ב");
    await merge(a, b);
    for (let i = 0; i < 6; i++) expect((await call("/thread", { t: b, text: "תגובה " + i })).status).toBe(200);
    expect((await call("/thread", { t: a, text: "עוד" })).status).toBe(429);
  });
});
