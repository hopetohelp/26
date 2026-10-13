import { beforeEach, describe, expect, it } from "vitest";
import worker from "../index.js";
import { fakeD1 } from "./fakeD1.js";

const OLD = "https://hopetohelp.github.io";
const NEW = "https://26.hopetohelp.net";
let env;
let now;
beforeEach(() => {
  now = Date.parse("2026-10-13T15:00:00Z");
  env = { DB: fakeD1(), DATA_KEY: "test-key", IP_KEY: "test-ip", ALLOWED_ORIGINS: `${OLD},${NEW}`, NOW: () => now };
});

async function call(path, origin, body) {
  const response = await worker.fetch(new Request("https://worker.example" + path, {
    method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify(body),
  }), env);
  return { status: response.status, data: await response.json() };
}

describe("מסירת מידע מדפדפן ישן לחדש", () => {
  it("מצפינה סשן וטיוטה, משמרת מסך, מאשרת קליטה פעם אחת", async () => {
    const entries = [["elections26.crowd.token", "private-session"], ["elections26.crowd.draft.seats", "{\"seats\":{}}"]];
    const next = `${NEW}/#/g/friends?tab=vote`;
    const created = await call("/migration/create", OLD, { entries, next });
    expect(created.status).toBe(200);
    expect(created.data.ticket).toMatch(/^[\w-]{43}$/);
    const row = env.DB.raw.prepare("SELECT ticket_hash, payload_enc FROM legacy_handoffs").get();
    expect(row.ticket_hash).not.toBe(created.data.ticket);
    expect(row.payload_enc).not.toContain("private-session");
    const read = await call("/migration/read", NEW, { ticket: created.data.ticket });
    expect(read.data).toEqual({ entries, next });
    expect((await call("/migration/status", OLD, { ticket: created.data.ticket })).data.complete).toBe(false);
    expect((await call("/migration/finish", NEW, { ticket: created.data.ticket })).data.ok).toBe(true);
    expect((await call("/migration/finish", NEW, { ticket: created.data.ticket })).data.ok).toBe(true);
    expect((await call("/migration/status", OLD, { ticket: created.data.ticket })).data.complete).toBe(true);
    expect(env.DB.raw.prepare("SELECT payload_enc FROM legacy_handoffs").get().payload_enc).toBeNull();
    expect((await call("/migration/read", NEW, { ticket: created.data.ticket })).status).toBe(410);
  });

  it("מגבילה מקורות, מפתחות, כתובות יעד ותוקף הכרטיס", async () => {
    const good = { entries: [["elections26.vid", "v1"]], next: NEW + "/#/polls" };
    expect((await call("/migration/create", "https://evil.example", good)).status).toBe(403);
    expect((await call("/migration/create", OLD, { ...good, entries: [["elections26.admin", "secret"]] })).status).toBe(400);
    expect((await call("/migration/create", OLD, { ...good, next: "https://evil.example/" })).status).toBe(400);
    const made = await call("/migration/create", OLD, good);
    expect((await call("/migration/read", OLD, { ticket: made.data.ticket })).status).toBe(403);
    expect((await call("/migration/finish", OLD, { ticket: made.data.ticket })).status).toBe(403);
    now += 11 * 60 * 1000;
    expect((await call("/migration/read", NEW, { ticket: made.data.ticket })).status).toBe(410);
  });

  it("מעבירה גם טיוטה גדולה בלי לקטוע את ההצפנה", async () => {
    const text = "x".repeat(140_000);
    const created = await call("/migration/create", OLD, { entries: [["elections26.crowd.draft.seats", text]], next: NEW + "/" });
    expect(created.status).toBe(200);
    const read = await call("/migration/read", NEW, { ticket: created.data.ticket });
    expect(read.data.entries[0][1]).toBe(text);
  });
});
