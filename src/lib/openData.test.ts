import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { meta } from "./data";
import { OPEN_FILES, SITE, buildFile, buildIndex, buildLlmsTxt, checkOpenData, methodUrl, validAnchors, wrapExternal } from "./openData";

/** בנייה בזיכרון — כמו scripts/open-data.ts, בלי לכתוב לדיסק */
function built(): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of OPEN_FILES) if (f.build) m.set(f.path, JSON.stringify(buildFile(f)));
  m.set("data/index.json", JSON.stringify(buildIndex(null)));
  m.set("llms.txt", buildLlmsTxt(null));
  return m;
}
const anchors = validAnchors();

describe("קובצי הנתונים הפתוחים", () => {
  it("כל הקבצים שבמשימה קיימים בקטלוג", () => {
    const paths = OPEN_FILES.map((f) => f.path);
    for (const p of ["data/polls.json", "data/average.json", "data/scenarios.json", "data/forecast.json", "data/results.json", "data/law.json", "data/accuracy.json", "dashboard.json", "data/party-images.json"])
      expect(paths).toContain(p);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("בכל קובץ: תאריך עדכון, מקור וקישור לערך קיים במילון המספרים", () => {
    for (const f of OPEN_FILES) {
      expect(anchors.has(f.methodAnchor), `${f.path}: ${f.methodAnchor}`).toBe(true);
      if (!f.build) continue;
      const about = buildFile(f).about as Record<string, string>;
      expect(about.updatedAt).toBe(meta.dataAsOf);
      expect(about.source.length).toBeGreaterThan(5);
      expect(about.method).toBe(methodUrl(f.methodAnchor));
      expect(about.method.startsWith(SITE)).toBe(true);
    }
  });

  it("הבדיקה עוברת על בנייה תקינה, ונכשלת על קובץ חסר, ישן או בלי about", () => {
    const ok = built();
    expect(checkOpenData((p) => ok.get(p) ?? null, { withDashboard: false, anchors })).toEqual([]);

    const missing = built();
    missing.delete("data/polls.json");
    expect(checkOpenData((p) => missing.get(p) ?? null, { withDashboard: false, anchors }).join()).toContain("data/polls.json חסר");

    const stale = built();
    const old = JSON.parse(stale.get("data/scenarios.json")!);
    old.about.updatedAt = "2026-01-01T00:00:00+02:00";
    stale.set("data/scenarios.json", JSON.stringify(old));
    expect(checkOpenData((p) => stale.get(p) ?? null, { withDashboard: false, anchors }).join()).toContain("לא עדכני");

    const bare = built();
    bare.set("data/forecast.json", "{}");
    expect(checkOpenData((p) => bare.get(p) ?? null, { withDashboard: false, anchors }).join()).toContain("אין about");

    // בפרסום: גם dashboard.json חייב להיות קיים ועטוף
    expect(checkOpenData((p) => ok.get(p) ?? null, { withDashboard: true, anchors }).join()).toContain("dashboard.json חסר");
    const f = OPEN_FILES.find((x) => x.path === "dashboard.json")!;
    ok.set("dashboard.json", JSON.stringify(wrapExternal(f, { publishedAt: "2026-10-12T08:00:00Z", participants: 3, open: true })));
    expect(checkOpenData((p) => ok.get(p) ?? null, { withDashboard: true, anchors })).toEqual([]);
  });

  it("עטיפת dashboard.json שומרת את כל השדות שהאתר קורא, ו'נכון ל' = מועד הפרסום של השרת", () => {
    const f = OPEN_FILES.find((x) => x.path === "dashboard.json")!;
    const raw = { publishedAt: "2026-10-12T08:00:00Z", participants: 12, open: true, seats: { n: 5 } };
    const w = wrapExternal(f, raw) as Record<string, unknown> & { about: { updatedAt: string } };
    expect(w).toMatchObject(raw);
    expect(w.about.updatedAt).toBe(raw.publishedAt);
    // עטיפה חוזרת לא מכפילה
    expect(Object.keys(wrapExternal(f, w)).filter((k) => k === "about")).toHaveLength(1);
  });

  it("llms.txt: המסכים, כל הקבצים, מילון המספרים והכללים — ובלי המילה האסורה", () => {
    const txt = buildLlmsTxt("https://example.test");
    for (const f of OPEN_FILES) expect(txt).toContain(SITE + f.path);
    expect(txt).toContain("#/method#model");
    expect(txt).toContain("אינו ממליץ");
    expect(txt).toContain("https://example.test/mcp");
    expect(txt).toContain("https://example.test/public");
    expect(txt).not.toContain("הסתברות");
    expect(buildLlmsTxt(null)).toContain("בבנייה");
  });

  it("AGENTS.md (הגרסה למפתחים) מזכיר כל קובץ שבאינדקס ואת הבדיקה", () => {
    const agents = readFileSync("AGENTS.md", "utf8");
    for (const f of OPEN_FILES) expect(agents, f.path).toContain(f.path);
    for (const s of ["src/lib/openData.ts", "scripts/open-data.ts", "scripts/check-open-data.ts", "llms.txt"]) expect(agents, s).toContain(s);
  });

  it("קובץ החוק: אותם הסכמים, סף וקולות כשרים שהמחשבון באתר משתמש בהם", async () => {
    const { AGREEMENTS_2026, validVotes } = await import("./lawSeats");
    const law = buildFile(OPEN_FILES.find((f) => f.path === "data/law.json")!) as { agreements: { pair: string[] }[]; validVotesDefault: number; threshold: number };
    expect(law.agreements.map((a) => a.pair)).toEqual(AGREEMENTS_2026.map((p) => [...p]));
    expect(law.validVotesDefault).toBe(validVotes());
    expect(law.threshold).toBe(3.25);
  });

  it("הממוצע בקובץ הוא אותו מספר שבאתר (מקור אחד, בלי חישוב חדש)", async () => {
    const { POLL_AVERAGE } = await import("./sources");
    const avg = buildFile(OPEN_FILES.find((f) => f.path === "data/average.json")!) as { average: { seats: Record<string, number> } };
    expect(avg.average.seats).toEqual(POLL_AVERAGE.seats);
  });
});
