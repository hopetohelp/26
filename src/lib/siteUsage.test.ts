import { afterEach, expect, it, vi } from "vitest";
import { isSiteUsage } from "./siteUsage";
const data = { totalVisitors: 2, totalVisits: 7, publishedAt: "2026-10-21T10:00:00Z" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
it("מקבל אפס אמיתי ודוחה נתונים חלקיים או ערכים לא תקינים", () => {
  expect(isSiteUsage(data)).toBe(true);
  expect(isSiteUsage({ ...data, totalVisitors: 0, totalVisits: 0 })).toBe(true);
  for (const bad of [null, {}, { ...data, totalVisitors: -1 }, { ...data, totalVisits: 1.5 }, { ...data, publishedAt: "bad" }]) expect(isSiteUsage(bad)).toBe(false);
});
it("קורא מספרים חיים ללא זיהוי אישי", async () => {
  vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.test");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
  vi.stubGlobal("fetch", fetch);
  const { loadSiteUsage } = await import("./siteUsage");
  const signal = new AbortController().signal;
  expect(await loadSiteUsage(signal)).toEqual({ data, live: true });
  expect(fetch).toHaveBeenCalledWith("https://feedback.test/usage", { signal, credentials: "omit" });
});
it("משתמש בעותק מתוארך כשהשרת נכשל ואינו ממציא אפס כשגם הגיבוי נכשל", async () => {
  vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.test");
  const fetch = vi.fn().mockResolvedValueOnce(new Response("offline", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify(data))).mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const { loadSiteUsage } = await import("./siteUsage");
  expect(await loadSiteUsage(new AbortController().signal)).toEqual({ data, live: false });
  await expect(loadSiteUsage(new AbortController().signal)).rejects.toThrow();
});
