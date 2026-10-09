import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import worker from "../index.js";
import { fakeD1 } from "./fakeD1.js";
import { seats } from "./helpers.js";

const CLIENT = "test-client.apps.googleusercontent.com";
let keyPair, jwk, env;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
async function idToken(claims, kid = "k1", key = keyPair.privateKey) {
  const head = enc({ alg: "RS256", kid, typ: "JWT" });
  const body = enc({ iss: "https://accounts.google.com", aud: CLIENT, sub: "1234567890", exp: Date.parse("2026-10-08T11:00:00Z") / 1000, email: "x@example.com", ...claims });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  jwk = { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: "k1" };
});
beforeEach(() => {
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", IP_KEY: "k", DATA_KEY: "d", GOOGLE_CLIENT_ID: CLIENT, GOOGLE_JWKS: [jwk], NOW: () => Date.parse("2026-10-08T10:00:00Z") };
});
const call = async (path, { body, token } = {}) => {
  const res = await worker.fetch(new Request("https://w.example" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin: env.ALLOWED_ORIGIN, "cf-connecting-ip": "1.1.1.1", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: res.status, data: await res.json().catch(() => null) };
};
const tok = (c) => c.repeat(43);

describe("כניסה עם Google", () => {
  it("אסימון תקף יוצר משתתף; כניסה חוזרת מגיעה לאותו משתתף; אסימון הדפדפן עובד בעיוורון", async () => {
    const first = await call("/auth/google", { body: { credential: await idToken({}), token: tok("a") } });
    expect(first).toMatchObject({ status: 200, data: { token: tok("a") } });
    expect((await call("/save", { token: tok("a"), body: { unit: "seats", op_id: "op-aaaaaaaaaa", registry: "r", payload: seats(60) } })).status).toBe(200);
    const again = await call("/auth/google", { body: { credential: await idToken({}), token: tok("b") } });
    const me = await call("/me", { token: again.data.token });
    expect(me.data).toMatchObject({ google: true, guest: false, username: null });
    expect(me.data.latest.seats).toBeTruthy();
    // ניסיון חוזר באותו אסימון לא יוצר משתתף נוסף
    expect((await call("/auth/google", { body: { credential: await idToken({}), token: tok("b") } })).data.token).toBe(tok("b"));
  });

  it("חשבון מייל שמתחבר עם Google שומר את ההשערה שלו, ושני המיילים נשמרים בו", async () => {
    const g = await call("/auth/register", { body: { email: "mine@example.com", password: "a fine password 1" } });
    await call("/save", { token: g.data.token, body: { unit: "seats", op_id: "op-bbbbbbbbbb", registry: "r", payload: seats(60) } });
    const r = await call("/auth/google", { token: g.data.token, body: { credential: await idToken({ sub: "guest-sub", email_verified: true }), token: tok("h") } });
    const me = await call("/me", { token: r.data.token });
    expect(me.data).toMatchObject({ google: true });
    expect(me.data.latest.seats).toBeTruthy();
    expect(me.data.emails.map((e) => e.email).sort()).toEqual(["mine@example.com", "x@example.com"]);
  });

  it("דוחה חתימה זרה, קהל אחר, מנפיק אחר ותוקף שפג", async () => {
    const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    for (const credential of [
      await idToken({}, "k1", other.privateKey),
      await idToken({ aud: "other" }),
      await idToken({ iss: "https://evil.example" }),
      await idToken({ exp: Date.parse("2026-10-08T09:00:00Z") / 1000 }),
      "not.a.jwt",
    ]) expect((await call("/auth/google", { body: { credential } })).status).toBe(401);
  });
});
