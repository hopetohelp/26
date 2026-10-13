import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { siteJson, resetSiteCache, SiteUnavailable } from "../lib/site.js";
beforeEach(resetSiteCache);
afterEach(() => vi.unstubAllGlobals());
it("כשל רענון מסומן בלי לשנות את תאריך הנתון", async () => {
  const env = { SITE_URL: "https://one.example/" };
  const original = { about: { updatedAt: "2026-10-10", snapshotId: "snapshot" }, value: 32 };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(original)));
  await siteJson(env, "data/average.json", 1000);
  vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
  const cached = await siteJson(env, "data/average.json", 400_000);
  expect(cached.value).toBe(32);
  expect(cached.about).toMatchObject({ updatedAt: "2026-10-10", snapshotId: "snapshot", cacheStatus: "saved-after-failure" });
  await expect(siteJson({ SITE_URL: "https://two.example/" }, "data/average.json", 400_000)).rejects.toBeInstanceOf(SiteUnavailable);
});
it("תגובה שאינה JSON אינה מחליפה עותק תקין", async () => {
  const env = { SITE_URL: "https://one.example/" };
  vi.stubGlobal("fetch", async () => new Response('{"about":{"updatedAt":"2026-10-10"},"value":1}'));
  await siteJson(env, "data/results.json", 1000);
  vi.stubGlobal("fetch", async () => new Response("not json"));
  expect((await siteJson(env, "data/results.json", 400_000)).about.cacheStatus).toBe("saved-after-failure");
});
