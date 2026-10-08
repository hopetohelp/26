import { describe, expect, it, vi } from "vitest";
import worker from "../index.js";

describe("internal account gateway", () => {
  it("preserves credentials, client identity, body, query and response", async () => {
    const fetch = vi.fn(async request => {
      expect(new URL(request.url).pathname).toBe("/save");
      expect(new URL(request.url).search).toBe("?mode=seats");
      expect(request.headers.get("authorization")).toBe("Bearer private-token");
      expect(request.headers.get("cf-connecting-ip")).toBe("1.2.3.4");
      expect(request.headers.get("origin")).toBe("https://hopetohelp.github.io");
      expect(await request.json()).toEqual({ cells: { likud: 120 } });
      return new Response('{"ok":true}', { status: 201 });
    });
    const response = await worker.fetch(new Request("https://feedback.example/crowd/save?mode=seats", { method: "POST", headers: { authorization: "Bearer private-token", "cf-connecting-ip": "1.2.3.4", origin: "https://hopetohelp.github.io" }, body: JSON.stringify({ cells: { likud: 120 } }) }), { CROWD: { fetch } });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });
  it("allows authenticated requests and account deletion in preflight", async () => {
    const response = await worker.fetch(new Request("https://feedback.example/crowd/me", { method: "OPTIONS", headers: { origin: "https://hopetohelp.github.io" } }), { ALLOWED_ORIGIN: "https://hopetohelp.github.io" });
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
  });
  it("fails explicitly when the service binding is missing", async () => {
    expect((await worker.fetch(new Request("https://feedback.example/crowd/me"), {})).status).toBe(503);
  });
});

describe("בדיקת חיבור וסיווג כשלים", () => {
  const origin = "https://hopetohelp.github.io";
  const env = (rows) => ({
    ALLOWED_ORIGIN: origin,
    DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => rows.push([sql, ...a]) }) }) },
  });
  it("ping עונה ב-GET וב-POST בלי מאגר, עם CORS", async () => {
    for (const method of ["GET", "POST"]) {
      const res = await worker.fetch(new Request("https://feedback.example/ping", { method, headers: { origin }, body: method === "POST" ? '{"password":"x"}' : undefined }), { ALLOWED_ORIGIN: origin });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    }
  });
  it("diag שומר מונה לפי סיווג מוכר בלבד", async () => {
    const rows = [];
    const ok = await worker.fetch(new Request("https://feedback.example/diag", { method: "POST", headers: { origin }, body: JSON.stringify({ kind: "feedback-only" }) }), env(rows));
    expect(ok.status).toBe(200);
    expect(rows[0][2]).toBe("diag:feedback-only");
    const bad = await worker.fetch(new Request("https://feedback.example/diag", { method: "POST", headers: { origin }, body: JSON.stringify({ kind: "free text" }) }), env(rows));
    expect(bad.status).toBe(400);
    expect(rows).toHaveLength(1);
  });
});

describe("דיווח כשל חיבור אוטומטי", () => {
  const origin = "https://hopetohelp.github.io";
  const post = (env, body) => worker.fetch(new Request("https://feedback.example/autoreport", { method: "POST", headers: { origin, "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify(body) }), env);
  const makeEnv = (existing = 0) => {
    const inserts = [];
    return {
      inserts,
      ALLOWED_ORIGIN: origin,
      DB: { prepare: (sql) => ({ bind: (...a) => ({ first: async () => ({ n: existing }), run: async () => inserts.push([sql, ...a]) }) }) },
    };
  };
  it("נשמר כהערה חדשה עם תחילית, בלי אישור ובלי אסימון בתשובה", async () => {
    const env = makeEnv();
    const res = await post(env, { log: '{"code":"network"}' });
    expect(await res.json()).toEqual({ ok: true });
    expect(env.inserts).toHaveLength(1);
    expect(env.inserts[0][2]).toMatch(/^\[כשל חיבור אוטומטי\]\n/);
  });
  it("אחרי 3 ביום מאותו מקור — מתעלם בלי שגיאה", async () => {
    const env = makeEnv(3);
    expect(await (await post(env, { log: "x" })).json()).toEqual({ ok: true, dropped: true });
    expect(env.inserts).toHaveLength(0);
  });
  it("בלי לוג — נדחה", async () => {
    expect((await post(makeEnv(), {})).status).toBe(400);
  });
});

