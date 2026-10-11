import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

afterEach(() => { vi.unstubAllEnvs(); });

async function load() {
  vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example.workers.dev");
  vi.stubEnv("VITE_CROWD_URL", "https://crowd.example.workers.dev/");
  vi.resetModules();
  return { api: await import("../lib/crowdApi"), mod: await import("./FilterBlocked") };
}

it("כתובות השרת לבקשה מהסינון: שם המארח בלבד, בלי כפילות", async () => {
  const { api } = await load();
  expect(api.SERVER_HOSTS).toEqual(["feedback.example.workers.dev", "crowd.example.workers.dev"]);
});

it("נוסח הבקשה מבקש את כל הנתיבים ומונה את כל הכתובות", async () => {
  const { mod } = await load();
  const text = mod.filterRequestText(["a.example", "b.example"], "https://site.example/26/");
  expect(text).toContain("https://site.example/26/");
  expect(text).toContain("כל הנתיבים, כולל בקשות POST");
  expect(text).toContain("a.example\nb.example");
});

it("ההסבר מציג את הכתובות וכפתור העתקה", async () => {
  const { mod } = await load();
  const html = renderToStaticMarkup(createElement(mod.default, { signedIn: true, onRetry: () => {} }));
  expect(html).toContain("crowd.example.workers.dev");
  expect(html).toContain("העתקת נוסח הבקשה לסינון");
  expect(html).toContain("לנסות שוב");
  expect(html).toContain("ייתכן שהכניסה כבר נקלטה בשרת");
});

it("כל המסלולים נכשלו ברשת ⇐ השרת מסומן כחסום; תשובה מהשרת ⇐ מתבטל", async () => {
  const { api } = await load();
  const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  await expect(api.call("/me", { token: "t" })).rejects.toMatchObject({ code: "network" });
  expect(api.serverBlocked()).toBe(true);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
  await api.call("/ping");
  expect(api.serverBlocked()).toBe(false);
  vi.unstubAllGlobals();
});
