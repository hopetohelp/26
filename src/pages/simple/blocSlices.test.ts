import { describe, expect, it } from "vitest";
import { SIMPLE_BLOCS } from "../../lib/simpleSources";
import { blocSlices } from "./shared";

describe("bloc slices — displayed numbers", () => {
  it("averages that round up separately still sum to 120 (not 121)", () => {
    const [a, b, c, d] = SIMPLE_BLOCS.map((x) => x.lists[0]);
    const slices = blocSlices({ [a]: 50.5, [b]: 17.5, [c]: 9.6, [d]: 42.4 });
    expect(slices.reduce((s, x) => s + Math.round(x.value), 0)).toBe(121);
    expect(slices.reduce((s, x) => s + x.shown, 0)).toBe(120);
    for (const x of slices) expect(Math.abs(x.shown - x.value)).toBeLessThan(1);
  });
  it("whole numbers are shown as they are, with the missing part", () => {
    const [a] = SIMPLE_BLOCS.map((x) => x.lists[0]);
    expect(blocSlices({ [a]: 60 }, 60).map((x) => [x.id, x.shown])).toEqual([["netanyahu", 60], ["missing", 60]]);
  });
});
