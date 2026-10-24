import { describe, it, expect, beforeEach } from "vitest";
import worker, { resetDashboardCache } from "../index.js";
import { fakeD1 } from "./fakeD1.js";

// אישור נוסח הפרטיות (הכרעת בעלים 24.10.2026): נשמר בחשבון עם גרסה; גרסה ישנה לא דורסת חדשה; נמחק עם החשבון
let env, t, ipN = 0;
beforeEach(() => {
  resetDashboardCache();
  t = Date.parse("2026-10-24T18:00:00Z");
  env = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: "https://hopetohelp.github.io/26/", IP_KEY: "ip-secret", DATA_KEY: "data-secret", NOW: () => t };
});
const call = async (path, { body, token } = {}) => {
  const res = await worker.fetch(new Request("https://w.example" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.9.0.${(ipN++ % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: res.status, data: await res.json().catch(() => null) };
};

describe("privacy consent", () => {
  it("נשמר בחשבון, לא יורד לגרסה ישנה, ונמחק עם החשבון", async () => {
    const { data: { token } } = await call("/auth/register", { body: { email: "p@x.co", password: "a long pass phrase" } });
    expect((await call("/me", { token })).data.privacy).toBeNull();
    expect((await call("/account/privacy", { token, body: { version: 2 } })).data.privacy).toBe(2);
    expect((await call("/account/privacy", { token, body: { version: 1 } })).data.privacy).toBe(2);
    expect((await call("/me", { token })).data.privacy).toBe(2);
    expect((await call("/account/privacy", { token, body: { version: "x" } })).status).toBe(400);
    expect((await call("/account/privacy", { body: { version: 1 } })).status).toBe(401);
    await call("/delete", { token, body: { confirm: "מחק" } });
    expect(env.DB.raw.prepare("SELECT count(*) AS n FROM privacy_consents").get().n).toBe(0);
  });
});
