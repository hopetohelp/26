import { describe, expect, it } from "vitest";
import { blocSummary, largestBloc } from "./blocSummary";

const blocs = (t1: number | null, t2: number | null) => ({
  mode: "custom" as const,
  blocs: [
    { id: "a", name: "גוש א", lists: ["x", "y"], target: t1 },
    { id: "b", name: "גוש ב", lists: ["z"], target: t2 },
    { id: "c", name: "ריק", lists: [], target: null },
  ],
});

describe("blocSummary", () => {
  it("סוכם לפי הרשימות של כל גוש, בלי גוש ריק", () => {
    expect(blocSummary(blocs(61, 59), { x: 30, y: 31, z: 59 })).toEqual([
      { name: "גוש א", total: 61, lists: ["x", "y"] },
      { name: "גוש ב", total: 59, lists: ["z"] },
    ]);
  });
  it("ההרכב מופיע בשיתוף גם בלי יעד מספרי", () => {
    expect(blocSummary(blocs(null, null), { x: 1 })).toEqual([{ name: "גוש א", total: 1, lists: ["x", "y"] }, { name: "גוש ב", total: 0, lists: ["z"] }]);
    expect(blocSummary(null, { x: 1 })).toBeUndefined();
  });
  it("בוחר רק את הגדול לפי ההשערה ולא לפי יעד, ובשוויון את הראשון", () => {
    const summary = blocSummary(blocs(100, 1), { x: 10, y: 0, z: 40 });
    expect(largestBloc(summary)).toEqual({ name: "גוש ב", total: 40, lists: ["z"] });
    expect(largestBloc(blocSummary(blocs(null, null), { x: 40, z: 40 }))?.name).toBe("גוש א");
    expect(largestBloc(undefined)).toBeUndefined();
  });
});
