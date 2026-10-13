import { describe, expect, it } from "vitest";
import { adjustedAverage, createDataProvider, reconstructPoll, sourceOptions } from "./dataResolverCore";
import { identity, SCREEN_POLICY, sourceAllowed } from "./dataCatalog";
import { cleanDataPreference, newerPreference } from "./dataPreferences";
import type { Poll } from "./data";
const poll = (id: string, values: Poll["values"], firm = "Kantar", publisher: string | null = "Kan", end = "2026-10-12"): Poll => ({ id, values, firm, publisher, firmHe: "קנטאר", publisherHe: publisher, end, start: end, sample: null, gov: null, consistent: true, eligibleToShow: true, urls: [], verified: false, source: { page: "מקור", tableLine: 1 } });
const provider = (polls: Poll[]) => createDataProvider({ polls, meta: { dataAsOf: "2026-10-13T00:00:00Z", agreements2026: [] }, lists2026: [{ id: "a", name: "א" }, { id: "b", name: "ב" }], model: { asof: "2026-10-13", lastPoll: "2026-10-12", polls: 2, pollsters: 2, central: { seats: { a: 80, b: 40 }, shares: { a: 66, b: 33 } } } });
describe("שלושה מוצרים עם חוזה וקלט מפורש", () => {
  it("ממוצע חשבוני שומר שברים ואפס ידוע, וחסר אינו אפס", () => {
    const p = provider([poll("1", { a: { s: 3 }, b: { s: 117 } }), poll("2", { a: { p: 2 } }, "Other")]);
    expect(p.resolveData({ product: "polls.mean" }, ["a"]).value).toBe(1.5);
    expect(p.resolveData({ product: "polls.mean" }, ["b"]).value).toBe(117);
    expect(p.resolveData({ product: "polls.mean" }, ["a", "b", "a"]).value).toBe(60);
    expect(p.resolveData({ product: "model.mean" }, ["a"]).value).toBe(80);
  });
  it("הסקר האחרון מכל סדרה נספר פעם אחת; מחוץ לחלון אין השלמה", () => {
    const p = provider([poll("old", { a: { s: 90 } }, "Kantar", "Kan", "2026-09-20"), poll("new", { a: { s: 20 } }), poll("second", { a: { s: 40 } }, "Kantar", "Other")]);
    expect(p.CURRENT_POLLS.map(x => x.id).sort()).toEqual(["new", "second"]);
    expect(p.resolveData({ product: "poll.single", source: "firm:Kantar" }, ["a"]).value).toBe(30);
    expect(p.resolveData({ product: "polls.mean" }, ["a"]).value).toBe(30);
    expect(p.resolveData({ product: "poll.single", source: "series:missing" }, ["a"]).status).toBe("missing");
  });
  it("מכון עם שני מזמינים מציג שלוש אפשרויות; עם מזמין אחד רק צירוף אחד", () => {
    const input = [poll("1", {}), poll("2", {}, "Kantar", "Other"), poll("3", {}, "Solo")];
    const options = sourceOptions(input);
    expect(options.filter(o => o.firmId === "Kantar")).toHaveLength(3);
    expect(options.filter(o => o.firmId === "Solo")).toHaveLength(1);
    expect(options).toHaveLength(4);
  });
  it("מקור וגרסה משנים ראיה; סדר והרכב ללא כפילות נשמרים", () => {
    const p = provider([poll("1", { a: { s: 60 }, b: { s: 60 } })]);
    const a = p.resolveData({ product: "polls.mean" }, ["a", "b"]);
    expect(p.resolveData({ product: "polls.mean" }, ["b", "a", "a"]).evidenceId).toBe(a.evidenceId);
    expect(p.resolveData({ product: "model.mean" }, ["a", "b"]).evidenceId).not.toBe(a.evidenceId);
    expect(provider([poll("2", { a: { s: 60 }, b: { s: 60 } })]).SNAPSHOT_ID).not.toBe(p.SNAPSHOT_ID);
    expect(identity({ b: 1, a: 2 })).toBe(identity({ a: 2, b: 1 }));
  });
  it("סקר האתר והקבוצות אינם מתירים מודל או מותאם", () => {
    for (const screen of ["community", "groups"] as const) {
      expect(sourceAllowed(screen, "polls.adjusted")).toBe(false);
      expect(provider([]).resolveData({ product: "model.mean" }, ["a"], screen)).toMatchObject({ status: "unsupported", value: null });
    }
    expect(Object.keys(SCREEN_POLICY)).toEqual(expect.arrayContaining(["home", "today", "scenarios", "polls", "trends", "changes", "guess", "community", "groups", "past", "method"]));
  });
});
describe("ממוצע מותאם נפרד מהמודל", () => {
  it("50%,47%,3%: הסף מוציא את ג; חלוקה 62 ו-58 מתוך 120", () => {
    const r = adjustedAverage([poll("reported", { a: { p: 50 }, b: { p: 47 }, c: { p: 3 } })], ["a", "b", "c"], []);
    expect(r.status).toBe("available"); expect(r.seats).toEqual({ a: 62, b: 58, c: 0 });
    expect(r.observations[0].origin.c).toBe("reported");
  });
  it("חסר אינו חוסם ממוצע מותאם, והשלמה מסומנת כהנחה בקלט", () => {
    const result = adjustedAverage([poll("incomplete", { a: { p: 60 } })], ["a", "b"]);
    expect(result.status).toBe("available");
    expect(result.seats).toEqual({ a: 120, b: 0 });
    expect(result.observations[0].origin.b).toBe("assumed-zero");
    expect(reconstructPoll(poll("zero", { a: { s: 120 }, b: { s: 0 } }), ["a", "b"]).status).toBe("missing");
  });
  it("שחזור עצמאי שומר אחוז מדווח ומזהה את יתר הערכים כשחזור", () => {
    const r = reconstructPoll(poll("seats", { a: { s: 72 }, b: { s: 48 }, c: { p: 1 } }), ["a", "b", "c"], []);
    expect(r.status).toBe("available"); expect(r.shares?.c).toBe(1);
    expect(r.origin).toEqual({ a: "reconstructed", b: "reconstructed", c: "reported" });
  });
  it("לא ממציא תוצאה בסכום אחוזים מעל 100", () => {
    expect(adjustedAverage([poll("bad", { a: { p: 60 }, b: { p: 60 } })], ["a", "b"]).status).not.toBe("available");
  });
});
describe("העדפה גרסאית וסנכרון", () => {
  const pref = { version: 1, selection: { product: "polls.mean" }, preferredAverage: "model.mean", updatedAt: "2026-10-12T00:00:00Z" };
  it("מנקה העדפה בלי לשמור בקשה זמנית או שדות של השערה", () => {
    expect(cleanDataPreference({ ...pref, selection: { product: "polls.mean", asOf: "2000-01-01" }, seats: {} })?.selection).toEqual({ product: "polls.mean" });
    expect(cleanDataPreference({ ...pref, selection: { product: "__proto__" } })).toBeNull();
    expect(cleanDataPreference({ ...pref, version: 2 })).toBeNull();
  });
  it("העדפה חדשה אינה נדרסת בתשובה ישנה", () => {
    const old = cleanDataPreference(pref)!;
    const fresh = { ...old, updatedAt: "2026-10-13T00:00:00Z" };
    expect(newerPreference(fresh, old)).toBe(fresh); expect(newerPreference(old, fresh)).toBe(fresh);
  });
});

it("תמיכה חסרה מושלמת מתצפית זמינה, אחוז מדווח נשמר והתוצאה תקפה", () => {
  const r = adjustedAverage([poll("first", { a: { s: 72 }, b: { s: 48 } }), poll("second", { a: { s: 72 }, b: { s: 48 }, c: { p: 2 } }, "Second")], ["a", "b", "c"], []);
  expect(r.status).toBe("available");
  expect(r.observations[0].shares.c).toBe(2);
  expect(r.observations[0].origin.c).toBe("imputed");
  expect(r.observations[1].shares.c).toBe(2);
  expect(r.observations[1].origin.c).toBe("reported");
  expect(Object.values(r.seats!).reduce((a, b) => a + b, 0)).toBe(120);
  expect(r.seats!.c).toBe(0);
});
it("הפרש ונתון לרוב נגזרים בשרת בלי מספר שהעוזר סיפק", () => {
  const p = provider([poll("one", { a: { s: 50 }, b: { s: 70 } })]);
  expect(p.resolveMetric({ selection: { product: "polls.mean" }, ids: ["a"], operation: "majorityGap" }).value).toBe(11);
  expect(p.resolveMetric({ selection: { product: "polls.mean" }, ids: ["a"], operation: "difference", compareTo: { selection: { product: "model.mean" }, ids: ["a"] } }).value).toBe(-30);
});
