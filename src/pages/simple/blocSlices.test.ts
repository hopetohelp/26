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

describe("double pie — unity inside Netanyahu and Eisenkot", () => {
  it("unity covers exactly its lists and sits inside the Netanyahu+Eisenkot span", async () => {
    const { unityOverlay } = await import("./shared");
    const { UNITY_LISTS } = await import("../../lib/simpleSources");
    const values = Object.fromEntries(SIMPLE_BLOCS.flatMap(b => b.lists).map((id, i) => [id, (i % 5) + 1]));
    const u = unityOverlay(values);
    const sum = (ids: readonly string[]) => ids.reduce((s, id) => s + (values[id] ?? 0), 0);
    expect(u.value).toBe(sum(UNITY_LISTS));
    expect(u.start).toBeGreaterThanOrEqual(0);
    expect(u.start + u.value).toBeLessThanOrEqual(sum(SIMPLE_BLOCS[0].lists) + sum(SIMPLE_BLOCS[3].lists));
    for (const id of UNITY_LISTS) expect([...SIMPLE_BLOCS[0].lists, ...SIMPLE_BLOCS[3].lists]).toContain(id);
  });
});

describe("double pie labels — always inside, the number always shown", () => {
  it("a one-seat slice still shows its number; no 120 total line", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { DoublePie } = await import("./shared");
    const [net, har, arab, eis] = SIMPLE_BLOCS.map(b => b.lists[0]);
    const html = renderToStaticMarkup(createElement(DoublePie, { values: { [net]: 60, [har]: 1, [arab]: 4, [eis]: 55 } }));
    expect(html).toMatch(/>1<\/text>/);
    expect(html).toMatch(/>4<\/text>/);
    expect(html).not.toContain("f-pie-total");
    const sizes = [...html.matchAll(/font-size:([\d.]+)px/g)].map(m => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(6);
  });
});
