import { describe, expect, it } from "vitest";
import crowd from "../crowd/index.js";
import feedback from "../feedback/index.js";
import mcp from "../mcp/index.js";
import { allowedOrigin, returnSiteUrl } from "./origins.js";

const OLD = "https://hopetohelp.github.io";
const NEW = "https://26.hopetohelp.net";
const env = { ALLOWED_ORIGINS: `${OLD},${NEW}`, ALLOWED_ORIGIN: OLD, SITE_URL: `${OLD}/26/` };

describe("שני אתרים מול אותם שרתים", () => {
  it("רק שני מקורות מדויקים מורשים, וכתובת החזרה נבחרת מהם בלבד", () => {
    for (const origin of [OLD, NEW]) expect(allowedOrigin(env, origin)).toBe(true);
    for (const origin of ["https://evil.example", `${NEW}.evil.example`, "http://26.hopetohelp.net", "null"])
      expect(allowedOrigin(env, origin)).toBe(false);
    expect(returnSiteUrl(env, NEW)).toBe(`${NEW}/`);
    expect(returnSiteUrl(env, "https://evil.example")).toBe(`${OLD}/26/`);
    expect(returnSiteUrl({ ...env, SITE_URL: `${NEW}/` }, OLD)).toBe(`${OLD}/26/`);
  });

  it("בקשות OPTIONS עם Authorization נתמכות בשני המקורות בכל שרת", async () => {
    for (const [worker, path] of [[crowd, "/me"], [feedback, "/crowd/me"], [mcp, "/admin/stats"]]) {
      for (const origin of [OLD, NEW, "https://evil.example"]) {
        const res = await worker.fetch(new Request(`https://worker.example${path}`, { method: "OPTIONS", headers: { origin, "access-control-request-headers": "authorization" } }), env);
        expect(res.headers.get("access-control-allow-origin")).toBe(origin === OLD || origin === NEW ? origin : null);
        expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
      }
    }
  });
});
