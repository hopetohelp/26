import { describe, expect, it } from "vitest";
import { page, RELOAD_GAP_MS, RELOAD_KEY, shouldReload } from "./chunkReload";

const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("chunk reload after a new release", () => {
  it("reloads once, not again right after, and again on a later release", () => {
    const s = store();
    expect(shouldReload(1_000_000, s)).toBe(true);
    expect(shouldReload(1_000_000 + RELOAD_GAP_MS - 1, s)).toBe(false);
    expect(shouldReload(1_000_000 + RELOAD_GAP_MS + 5_000, s)).toBe(true);
  });
  it("the old one-time flag does not block a reload", () => {
    expect(shouldReload(Date.now(), store({ [RELOAD_KEY]: "1" }))).toBe(true);
  });
  it("no storage — no reload", () => {
    expect(shouldReload(1, { getItem: () => { throw new Error("blocked"); }, setItem: () => {} })).toBe(false);
  });
  it("an empty result while reloading waits instead of crashing; a normal module passes through", async () => {
    const mod = { default: "Screen" };
    await expect(page(async () => mod)()).resolves.toBe(mod);
    const pending = await Promise.race([page(async () => undefined as unknown as typeof mod)().then(() => "resolved"), new Promise((r) => setTimeout(() => r("waiting"), 50))]);
    expect(pending).toBe("waiting");
  });
});
