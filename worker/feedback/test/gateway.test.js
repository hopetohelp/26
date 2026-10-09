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

  it("diag שומר בדיקת עומק רק ביעד ותוצאה מוכרים", async () => {
    const rows = [];
    const send = (kind) => worker.fetch(new Request("https://feedback.example/diag", { method: "POST", headers: { origin }, body: JSON.stringify({ kind }) }), env(rows));
    expect((await send("probe-gapi-ok")).status).toBe(200);
    expect(rows[0][2]).toBe("diag:probe-gapi-ok");
    expect((await send("probe-evil-ok")).status).toBe(400);
    expect((await send("probe-gapi-maybe")).status).toBe(400);
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

describe("ממסר שמירה", () => {
  const origin = "https://hopetohelp.github.io";
  const enc = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))));
  const post = (env, d) => worker.fetch(new Request("https://feedback.example/relay", { method: "POST", headers: { origin, "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify({ d }) }), env);
  it("מעביר לשרת ההשתתפות עם אסימון, IP וגוף", async () => {
    const fetch = vi.fn(async (req) => {
      expect(new URL(req.url).pathname).toBe("/save");
      expect(req.headers.get("authorization")).toBe("Bearer tok");
      expect(req.headers.get("cf-connecting-ip")).toBe("1.2.3.4");
      expect(await req.json()).toEqual({ unit: "seats", note: "שלום" });
      return new Response('{"version":3}', { status: 201 });
    });
    const res = await post({ ALLOWED_ORIGIN: origin, CROWD: { fetch } }, enc({ path: "/save", method: "POST", token: "tok", body: { unit: "seats", note: "שלום" } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ version: 3 });
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
  });
  it("מעביר גם את נתיבי החשבון והאימות (מי שהמסלולים הרגילים חסומים לו)", async () => {
    for (const path of ["/account/verify/send", "/account/verify/check", "/account/name", "/account/password"]) {
      const fetch = vi.fn(async (req) => {
        expect(new URL(req.url).pathname).toBe(path);
        expect(req.headers.get("authorization")).toBe("Bearer tok");
        return new Response('{"ok":true}');
      });
      const res = await post({ ALLOWED_ORIGIN: origin, CROWD: { fetch } }, enc({ path, method: "POST", token: "tok", body: {} }));
      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
  it("נתיב לא מוכר או קידוד שבור — נדחה", async () => {
    const fetch = vi.fn();
    expect((await post({ ALLOWED_ORIGIN: origin, CROWD: { fetch } }, enc({ path: "/admin", method: "POST" }))).status).toBe(400);
    expect((await post({ ALLOWED_ORIGIN: origin, CROWD: { fetch } }, "%%%")).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("ממסר הסטטיסטיקות הציבוריות", () => {
  it("מעביר את הסטטיסטיקה ויומן ההחרגות בלי זהות", async () => {
    for (const path of ["/dashboard", "/log"]) {
      const fetch = vi.fn(async req => {
        expect(new URL(req.url).pathname).toBe(path);
        expect(req.method).toBe("GET");
        expect(req.headers.has("authorization")).toBe(false);
        return new Response('{"participants":12}');
      });
      const d = btoa(JSON.stringify({ path, method: "GET" }));
      const response = await worker.fetch(new Request("https://feedback.example/relay", { method: "POST", headers: { origin: "https://hopetohelp.github.io" }, body: JSON.stringify({d}) }), { CROWD: {fetch} });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({participants:12});
    }
  });
});
