import { describe, it, expect, beforeEach } from "vitest";
import worker from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { seats } from "./helpers.js";

let env;
beforeEach(() => {
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: "https://hopetohelp.github.io/26/", IP_KEY: "k", NOW: () => Date.parse("2026-10-08T10:00:00Z") };
});
const call = async (path, { body, token, method } = {}) => {
  const res = await worker.fetch(
    new Request("https://w.example" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", origin: env.ALLOWED_ORIGIN, "cf-connecting-ip": "1.1.1.1", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: res.status, data: await res.json().catch(() => null), cors: res.headers.get("access-control-allow-origin") };
};
const save = (token, body) => call("/save", { token, body: { unit: "seats", op_id: "op-" + Math.random().toString(36).slice(2, 12), registry: "r", payload: seats(60), ...body } });

describe("בדיקת חיבור", () => {
  it("ping ב-GET וב-POST, עם כותרות CORS ובלי זהות", async () => {
    expect(await call("/ping")).toMatchObject({ status: 200, data: { ok: true }, cors: env.ALLOWED_ORIGIN });
    expect(await call("/ping", { body: { password: "x" } })).toMatchObject({ status: 200, data: { ok: true } });
  });
});

describe("שמירה בלי משתמש", () => {
  it("אורח נשמר בשרת, בלי סיסמה ובלי קישור אישי; /me מסמן אורח", async () => {
    const g = await call("/auth/guest", { body: {} });
    expect(g.status).toBe(200);
    expect(g.data.token).toMatch(/^[\w-]{20,}$/);
    expect(g.data.link).toBeUndefined();
    expect((await save(g.data.token)).status).toBe(200);
    const me = await call("/me", { token: g.data.token });
    expect(me.data).toMatchObject({ username: null, guest: true });
    expect(me.data.latest.seats).toBeTruthy();
  });
  it("הוספת שם משתמש: נוצר קישור אישי, הנתונים נשארים, ואפשר להיכנס בסיסמה", async () => {
    const g = await call("/auth/guest", { body: {} });
    await save(g.data.token);
    const c = await call("/auth/claim", { token: g.data.token, body: { username: "Guest_1", password: "abc12x" } });
    expect(c.status).toBe(200);
    expect(c.data).toMatchObject({ username: "Guest_1" });
    expect(c.data.link).toMatch(/^[\w-]{20,}$/);
    const me = await call("/me", { token: g.data.token });
    expect(me.data).toMatchObject({ username: "Guest_1", guest: false });
    expect(me.data.latest.seats).toBeTruthy();
    const l = await call("/auth/login", { body: { username: "guest_1", password: "abc12x" } });
    expect(l.status).toBe(200);
    expect((await call("/auth/link", { body: { link: c.data.link } })).status).toBe(200);
  });
  it("הוספת משתמש נדחית: בלי סשן, סיסמה חלשה, שם תפוס, או כשכבר יש משתמש", async () => {
    expect((await call("/auth/claim", { body: { username: "someone", password: "abc12x" } })).status).toBe(401);
    const g = await call("/auth/guest", { body: {} });
    expect((await call("/auth/claim", { token: g.data.token, body: { username: "someone", password: "123" } })).data.error).toBe("weak_password");
    expect((await call("/auth/claim", { token: g.data.token, body: { username: "x", password: "abc12x" } })).data.error).toBe("bad_username");
    await call("/auth/register", { body: { username: "taken_name", password: "abc12x" } });
    expect((await call("/auth/claim", { token: g.data.token, body: { username: "Taken_Name", password: "abc12x" } })).status).toBe(409);
    expect((await call("/auth/claim", { token: g.data.token, body: { username: "free_name", password: "abc12x" } })).status).toBe(200);
    expect((await call("/auth/claim", { token: g.data.token, body: { username: "other_name", password: "abc12x" } })).data.error).toBe("has_password");
  });
  it("אורחים כפופים לאותה הגבלת קצב כמו הרשמה", async () => {
    for (let i = 0; i < 15; i++) expect((await call("/auth/guest", { body: {} })).status).toBe(200);
    const r = await call("/auth/guest", { body: {} });
    expect(r.status).toBe(429);
    expect(r.cors).toBe(env.ALLOWED_ORIGIN);
  });
  it("מחיקה מלאה מסירה אורח", async () => {
    const g = await call("/auth/guest", { body: {} });
    await save(g.data.token);
    expect((await call("/delete", { token: g.data.token, body: { confirm: "מחק" } })).status).toBe(200);
    expect((await call("/me", { token: g.data.token })).status).toBe(401);
  });
});
