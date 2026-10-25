import { describe, expect, it } from "vitest";
import { requiresAdvanced } from "./interfaceMode";
import { seatSaveError } from "./seatSaveGuard";
import { IDS, startSeats } from "../pages/guess/model";
import type { SeatsPayload } from "./crowdApi";
import { SIMPLE_14_24, SIMPLE_ALL, SIMPLE_BLOCS, BLOC_IDS, personalBlocs, SIMPLE_DAYS, SIMPLE_FIRMS, simpleSelection, simpleSpread, simpleValue } from "./simpleSources";
import { CLOSED_LISTS } from "./data";
import { POLLSTER_LOGOS } from "./pollsterLogos";
import { existsSync } from "node:fs";
import { resolveData } from "./dataResolver";
const payload = (values: number[]): SeatsPayload => ({ ...startSeats("zero"), seats: Object.fromEntries(values.map((v, i) => [IDS[i], { v, locked: false, src: "manual" as const }])) });
describe("מצב פשוט ללא שינוי ביכולות מתקדמות", () => {
  it("קישורים לכלים מתקדמים נשמרים", () => {
    expect(requiresAdvanced("/guess", "?section=blocs")).toBe(true);
    expect(requiresAdvanced("/guess", "?g=shared")).toBe(true);
    expect(requiresAdvanced("/polls", "?tab=archive")).toBe(true);
    expect(requiresAdvanced("/guess", "?view=edit")).toBe(false);
    expect(requiresAdvanced("/community", "")).toBe(false);
    expect(requiresAdvanced("/g/hagzara", "")).toBe(false);
    expect(requiresAdvanced("/g/another-group", "")).toBe(true);
  });
  it("כל מסלול שמירה חוסם כנסת חלקית, עודפת או מפלגה לא תקינה", () => {
    for (const values of [[119], [121], [1, 119], [3, 117], [4.5, 115.5], [-1, 121], [NaN]]) expect(seatSaveError("seats", payload(values))).not.toBeNull();
    expect(seatSaveError("seats", payload([60, 60]))).toBeNull();
    expect(seatSaveError("seats", payload([120]))).toBeNull();
    expect(seatSaveError("seats", { ...payload([120]), mode: "pct" })).not.toBeNull();
    expect(seatSaveError("vote", { v2022: null, v2026: null })).toBeNull();
  });
  it("טורי הייחוס מגיעים מהספק, ומכון מופיע פעם אחת", () => {
    expect(new Set(SIMPLE_FIRMS.map(f => f.id)).size).toBe(SIMPLE_FIRMS.length);
    expect(simpleSelection("14-24")).toEqual(SIMPLE_14_24);
    expect(simpleValue(SIMPLE_ALL, [IDS[0]])).toBe(resolveData(SIMPLE_ALL, [IDS[0]], "community").value);
    expect(simpleSelection("unrecognized")).toEqual(SIMPLE_ALL);
  });
  it("ארבעת הגושים מכסים כל רשימה זכאית פעם אחת, בסדר התצוגה", () => {
    const all = SIMPLE_BLOCS.flatMap(b => [...b.lists]);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...BLOC_IDS].sort());
    expect(BLOC_IDS).toEqual(IDS.filter(id => !CLOSED_LISTS.includes(id)));
    expect(SIMPLE_BLOCS.map(b => b.short)).toEqual(["נתניהו", "חרדים", "ערבים", "אייזנקוט"]);
  });
  it("החלוקה האישית: ברירת המחדל המאושרת, כל רשימה זכאית בתא אחד, ושינוי מעביר בין תאים", () => {
    const d = personalBlocs();
    expect(d.map(b => b.short)).toEqual(["חרדים", "ימין", "אחדות", "שמאל", "ערבים"]);
    const all = d.flatMap(b => [...b.lists]);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...BLOC_IDS].sort());
    const cell = (bs: typeof d, id: string) => bs.find(b => b.lists.includes(id))?.id;
    for (const id of ["otzma", "rzp"].filter(x => BLOC_IDS.includes(x))) expect(cell(d, id)).toBe("right");
    if (BLOC_IDS.includes("democrats")) expect(cell(d, "democrats")).toBe("left");
    if (BLOC_IDS.includes("likud")) expect(cell(d, "likud")).toBe("unity");
    expect(d.find(b => b.id === "haredi")!.lists).toEqual(SIMPLE_BLOCS.find(b => b.id === "haredi")!.lists);
    expect(d.find(b => b.id === "arab")!.lists).toEqual(SIMPLE_BLOCS.find(b => b.id === "arab")!.lists);
    const moved = personalBlocs({ likud: "right", nope: "left", shas: "bogus" });
    expect(cell(moved, "likud")).toBe("right");
    if (BLOC_IDS.includes("shas")) expect(cell(moved, "shas")).toBe("haredi");
    expect(moved.flatMap(b => b.lists)).not.toContain("nope");
  });
  it("התצוגה הממוקדת: חלון של שבועיים, והקפסולה תחומה בטווח הסקרים", () => {
    expect(SIMPLE_ALL.days).toBe(SIMPLE_DAYS);
    const s = simpleSpread(SIMPLE_ALL, "likud");
    if (s) { expect([...s]).toEqual([...s].sort((a, b) => a - b)); expect(simpleValue(SIMPLE_ALL, ["likud"])!).toBeGreaterThanOrEqual(s[0]); expect(simpleValue(SIMPLE_ALL, ["likud"])!).toBeLessThanOrEqual(s[5]); }
  });
  it("לכל סמל מכון יש קובץ ומקור", () => {
    for (const l of Object.values(POLLSTER_LOGOS)) { expect(existsSync(`public/${l.file}`)).toBe(true); expect(l.source).toMatch(/^https:/); }
  });
});

describe("חלוקת הכנסת — אותה הגדרה באתר ובשרת", () => {
  it("חמש הקבוצות זהות ב-KNESSET_GROUPS וב-KNESSET_BLOCS", async () => {
    const { KNESSET_GROUPS } = await import("./simpleSources");
    const { KNESSET_BLOCS } = await import("../../worker/crowd/lib/blocDefinitions.js");
    const key = (l: readonly string[]) => [...l].sort().join(",");
    expect(KNESSET_BLOCS.map((b: { lists: string[] }) => key(b.lists))).toEqual(KNESSET_GROUPS.map(g => key(g.lists)));
  });
});
