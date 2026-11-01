import { describe, it, expect } from "vitest";
import { brokenPromises, columnSeats, inColumn, itemSeats, majorityLine, type ElectionPromise, type SurveyQuestion } from "./surveys";
import { results2026, hasResults } from "./guessAccuracyData";

const q: Extract<SurveyQuestion, { kind: "assign" }> = {
  id: "coalition", kind: "assign", title: "t",
  items: [{ id: "likud", label: "הליכוד", seats: 1 }, { id: "shas", label: "ש״ס", seats: 1 }, { id: "nolist", label: "x", seats: 5 }],
  columns: [{ id: "coalition", label: "קואליציה" }, { id: "abstain", label: "נמנעים" }, { id: "opposition", label: "אופוזיציה" }],
};

describe("site surveys — seats and majority", () => {
  it("takes seats from the site's results when they exist, else from the survey", () => {
    if (hasResults()) expect(itemSeats(q.items[0])).toBe(results2026.seats.likud);
    expect(itemSeats(q.items[2])).toBe(5);
  });
  it("sums seats per column", () => {
    const s = columnSeats(q, { likud: "coalition", shas: "coalition", nolist: "abstain" });
    expect(s.coalition).toBe(itemSeats(q.items[0]) + itemSeats(q.items[1]));
    expect(s.abstain).toBe(5);
    expect(s.opposition).toBe(0);
    expect(columnSeats(q, undefined)).toEqual({ coalition: 0, abstain: 0, opposition: 0 });
  });
  it("words the majority line from the data", () => {
    expect(majorityLine(0)).toBe("סמנו רשימות כדי לראות את סכום הקואליציה");
    expect(majorityLine(53)).toBe("חסרים 8 מנדטים לרוב");
    expect(majorityLine(64)).toBe("רוב של 64 מנדטים");
  });
});

describe("party split and election promises", () => {
  it("sums a split party by its chosen parts", () => {
    const s = columnSeats(q, { likud: { coalition: 3, opposition: 2 }, nolist: "coalition" });
    expect(s).toEqual({ coalition: 8, abstain: 0, opposition: 2 });
    expect(inColumn({ coalition: 1 }, "coalition")).toBe(true);
    expect(inColumn({ opposition: 1 }, "coalition")).toBe(false);
  });
  it("flags a promise only when both lists (or parts of them) sit in the coalition", () => {
    const list: ElectionPromise[] = [{ id: "p1", party: "a", speaker: "ר", quote: "ק", date: "1.10.2026", source: "https://example.org", sourceName: "מקור", never: ["b"] }];
    expect(brokenPromises({ a: "coalition", b: "opposition" }, "coalition", list)).toEqual([]);
    expect(brokenPromises({ a: "coalition", b: "coalition" }, "coalition", list).map((p) => p.id)).toEqual(["p1"]);
    expect(brokenPromises({ a: "coalition", b: { coalition: 2, opposition: 4 } }, "coalition", list).map((p) => p.id)).toEqual(["p1"]);
    expect(brokenPromises({ b: "coalition" }, "coalition", list)).toEqual([]);
  });
});
