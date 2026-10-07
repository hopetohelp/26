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
