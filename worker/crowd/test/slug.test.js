import { describe, it, expect } from "vitest";
import { slugFromName, freeSlug } from "../lib/slug.js";

// שם קישור אוטומטי מהשם בעברית (הכרעת בעלים 12.10.2026): תעתיק לפי ההגייה
describe("slugFromName", () => {
  it("transliterates Hebrew names to readable English", () => {
    expect(slugFromName("הגזרה")).toBe("hagzara");
    expect(slugFromName("המושב")).toBe("hamoshav");
    expect(slugFromName("השכונה")).toBe("hashkona");
    expect(slugFromName("הליכוד")).toBe("halikod");
  });
  it("keeps Latin letters and digits, joins words with a hyphen, ignores niqqud and punctuation", () => {
    expect(slugFromName("Gizra 2026")).toBe("gizra-2026");
    expect(slugFromName("הגזרה 2")).toBe("hagzara-2");
    expect(slugFromName("הַגְּזֵרָה!!")).toBe("hagzara");
    expect(slugFromName("  The   Group  ")).toBe("the-group");
  });
  it("always returns something the server accepts, or null when there is nothing to use", () => {
    const ok = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
    for (const n of ["א", "אב", "קבוצת הגליל המערבי והעמקים והגולן ועוד כמה שמות ארוכים מאוד", "x", "7", "ב-ג", "חברי הכנסת של הצפון"]) {
      const s = slugFromName(n);
      expect(s, n).toMatch(ok);
    }
    expect(slugFromName("")).toBeNull();
    expect(slugFromName("!!! ???")).toBeNull();
    expect(slugFromName(undefined)).toBeNull();
    expect(slugFromName("קבוצת הגליל המערבי והעמקים והגולן ועוד כמה שמות ארוכים מאוד").length).toBeLessThanOrEqual(32);
  });
});

describe("freeSlug", () => {
  it("adds -2, -3 when taken, staying within 32 characters", async () => {
    const taken = new Set(["hagzara", "hagzara-2"]);
    expect(await freeSlug("hagzara", async (s) => taken.has(s))).toBe("hagzara-3");
    const long = "a".repeat(32);
    const all = new Set([long]);
    const out = await freeSlug(long, async (s) => all.has(s));
    expect(out.length).toBeLessThanOrEqual(32);
    expect(out.endsWith("-2")).toBe(true);
  });
});
