import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// public/sw.js בסביבה מדומה: קובץ בנייה שחסר אחרי פרסום חדש מוחזר מהשרת כדף הבית (HTML) — אסור לשמור אותו כקוד.
function load(fetchImpl: (r: Request) => Promise<Response>) {
  const stores = new Map<string, Map<string, Response>>();
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        match: async (r: Request | string) => m.get(typeof r === "string" ? r : r.url)?.clone(),
        put: async (r: Request, res: Response) => { m.set(r.url, res); },
        keys: async () => [...m.keys()].map((u) => new Request(u)),
        delete: async (r: Request) => m.delete(r.url),
        addAll: async () => {},
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (k: string) => stores.delete(k),
  };
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = { addEventListener: (t: string, h: (e: unknown) => void) => { handlers[t] = h; }, location: { origin: "https://26.hopetohelp.net" }, skipWaiting: () => {}, clients: { claim: () => {} } };
  new Function("self", "caches", "fetch", readFileSync("public/sw.js", "utf8"))(self, caches, fetchImpl);
  const request = async (url: string) => {
    let out: Promise<Response> | undefined;
    handlers.fetch({ request: new Request(url), respondWith: (p: Promise<Response>) => { out = p; } });
    return out!;
  };
  return { request, stores };
}

describe("sw.js — קובצי בנייה", () => {
  it("קובץ שחסר (השרת מחזיר HTML) ⇐ 404 ולא נשמר", async () => {
    const { request, stores } = load(async () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    const res = await request("https://26.hopetohelp.net/assets/Guess-old.js");
    expect(res.status).toBe(404);
    expect([...stores.values()].every((m) => m.size === 0)).toBe(true);
  });

  it("קובץ קיים ⇐ מוחזר ונשמר", async () => {
    let calls = 0;
    const { request } = load(async () => { calls++; return new Response("export{}", { status: 200, headers: { "content-type": "application/javascript" } }); });
    expect((await request("https://26.hopetohelp.net/assets/Guess-new.js")).status).toBe(200);
    expect(await (await request("https://26.hopetohelp.net/assets/Guess-new.js")).text()).toBe("export{}");
    expect(calls).toBe(1);
  });
});
