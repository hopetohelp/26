import { describe, expect, it } from "vitest";
import type { Bloc, SeatCell } from "./crowdApi";
import { fillAll, fillErrorText, fillPct, largestRemainder } from "./fillAll";
import { validateBlocs, validatePct, validateSeats, validateVote } from "./crowdValidate";

const m = (v: number): SeatCell => ({ v, src: "manual", locked: true });
const sum = (s: Record<string, SeatCell>) => Object.values(s).reduce((a, c) => a + c.v, 0);
const bloc = (id: string, lists: string[], target: number | null): Bloc => ({ id, name: id, lists, target });

describe("largestRemainder", () => {
  it("sums exactly", () => {
    const r = largestRemainder(10, { a: 1, b: 1, c: 1 });
    expect(r.a + r.b + r.c).toBe(10);
    expect(r).toEqual({ a: 4, b: 3, c: 3 }); // שוויון ⇐ לפי המזהה
  });
  it("tie on remainder goes to the larger weight", () => {
    expect(largestRemainder(1, { a: 1, b: 3 })).toEqual({ a: 0, b: 1 });
  });
  it("zero weight gets zero; zero total", () => {
    expect(largestRemainder(5, { a: 0, b: 2 })).toEqual({ a: 0, b: 5 });
    expect(largestRemainder(0, { a: 1 })).toEqual({ a: 0 });
    expect(largestRemainder(5, { a: 0 })).toEqual({ a: 0 });
  });
});

describe("fillAll", () => {
  const ids = ["a", "b", "c", "d"];
  const polls = { a: 60, b: 30, c: 30, d: 0 };

  it("fills from empty by poll share, below-threshold gets 0", () => {
    const r = fillAll(ids, {}, polls, []);
    if (!r.ok) throw new Error();
    expect(sum(r.seats)).toBe(120);
    expect(r.seats).toMatchObject({ a: { v: 60, src: "filled" }, b: { v: 30 }, c: { v: 30 }, d: { v: 0 } });
  });

  it("keeps locked values and fills the rest proportionally", () => {
    const r = fillAll(ids, { a: m(20) }, polls, []);
    if (!r.ok) throw new Error();
    expect(r.seats.a).toEqual(m(20));
    expect(r.seats.b.v + r.seats.c.v).toBe(100);
    expect(r.seats.b.v).toBe(50);
    expect(r.changed).toEqual(["b", "c"]);
  });

  it("unlocked manual values are recomputed", () => {
    const r = fillAll(ids, { a: { v: 5, src: "manual", locked: false } }, polls, []);
    if (!r.ok) throw new Error();
    expect(r.seats.a.v).toBe(60);
    expect(r.seats.a.src).toBe("filled");
  });

  it("respects bloc targets", () => {
    const r = fillAll(ids, { a: m(10) }, polls, [bloc("g", ["a", "b"], 70)]);
    if (!r.ok) throw new Error();
    expect(r.seats.a.v).toBe(10);
    expect(r.seats.b.v).toBe(60);
    expect(r.seats.c.v).toBe(50);
    expect(r.seats.d.v).toBe(0);
    expect(sum(r.seats)).toBe(120);
  });

  it("fills parties outside a single partial bloc; targets need not sum to 120", () => {
    const r = fillAll(ids, {}, polls, [bloc("scenario", ["a"], 37)]);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.seats.a.v).toBe(37);
    expect(r.seats.b.v + r.seats.c.v).toBe(83);
    expect(sum(r.seats)).toBe(120);
  });

  it("does not add overlapping targets or require every party in a bloc", () => {
    const r = fillAll(ids, {}, polls, [bloc("first", ["a","b"], 90), bloc("second", ["a","b"], 90)]);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.seats.a.v + r.seats.b.v).toBe(90);
    expect(r.seats.c.v).toBe(30);
    expect(sum(r.seats)).toBe(120);
  });

  it("ignores blocs without target", () => {
    const r = fillAll(ids, {}, polls, [bloc("g", ["a"], null)]);
    expect(r.ok && r.seats.a.v).toBe(60);
  });

  it("bloc target of 0 gives zeros", () => {
    const r = fillAll(ids, {}, polls, [bloc("g", ["a"], 0)]);
    if (!r.ok) throw new Error();
    expect(r.seats.a.v).toBe(0);
    expect(r.seats.b.v + r.seats.c.v).toBe(120);
  });

  it("conflict: locked sum over 120", () => {
    const r = fillAll(ids, { a: m(100), b: m(30) }, polls, []);
    expect(r).toEqual({ ok: false, error: { kind: "over-120", locked: 130 } });
  });

  it("conflict: locked in bloc over target", () => {
    const r = fillAll(ids, { a: m(50) }, polls, [bloc("g", ["a", "b"], 40)]);
    expect(!r.ok && r.error.kind).toBe("bloc-over");
  });

  it("conflict: fully locked bloc mismatching target", () => {
    const r = fillAll(ids, { a: m(30) }, polls, [bloc("g", ["a"], 40)]);
    expect(!r.ok && r.error.kind).toBe("bloc-locked-mismatch");
  });

  it("fully locked bloc matching target is fine", () => {
    const r = fillAll(ids, { a: m(40) }, polls, [bloc("g", ["a"], 40)]);
    expect(r.ok && sum(r.seats)).toBe(120);
  });

  it("conflict: no eligible list in a bucket", () => {
    const r = fillAll(ids, {}, polls, [bloc("g", ["d"], 10)]);
    expect(r).toMatchObject({ ok: false, error: { kind: "no-eligible", bloc: "g", remainder: 10 } });
    const r2 = fillAll(["a", "d"], { a: m(100) }, polls, []);
    expect(r2).toMatchObject({ ok: false, error: { kind: "no-eligible", bloc: null, remainder: 20 } });
  });

  it("conflict: targets plus locked outside over 120", () => {
    const r = fillAll(ids, { c: m(30) }, polls, [bloc("g", ["a", "b"], 100)]);
    expect(!r.ok && r.error.kind).toBe("over-120");
    const r2 = fillAll(ids, {}, polls, [bloc("g", ["a"], 80), bloc("h", ["b"], 50)]);
    expect(!r2.ok && r2.error.kind).toBe("targets-over");
  });

  it("all locked at 120 changes nothing", () => {
    const r = fillAll(["a", "b"], { a: m(60), b: m(60) }, polls, []);
    expect(r.ok && r.changed).toEqual([]);
  });

  it("every error has Hebrew text", () => {
    for (const e of [
      { kind: "over-120", locked: 130 },
      { kind: "targets-over", sum: 130 },
      { kind: "bloc-over", bloc: "x", locked: 1, target: 0 },
      { kind: "bloc-locked-mismatch", bloc: "x", locked: 1, target: 2 },
      { kind: "no-eligible", bloc: null, remainder: 3 },
    ] as const)
      expect(fillErrorText(e).length).toBeGreaterThan(10);
  });
});

describe("validation", () => {
  it("vote", () => {
    expect(validateVote({ v2022: null, v2026: null }, ["מחל"], ["likud"])).not.toBeNull();
    expect(validateVote({ v2022: "מחל", v2026: null }, ["מחל"], ["likud"])).toBeNull();
    expect(validateVote({ v2022: "blank", v2026: "undecided" }, [], [])).toBeNull();
    expect(validateVote({ v2022: "undecided", v2026: null }, [], [])).not.toBeNull();
  });
  it("seats", () => {
    const p = (s: Record<string, number>) => ({ seats: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, m(v)])), start: "zero" as const, pollsAsOf: null });
    expect(validateSeats(p({ a: 60, b: 60 }), ["a", "b"])).toBeNull();
    expect(validateSeats(p({ a: 60, b: 59 }), ["a", "b"])).toMatch("נותרו 1");
    expect(validateSeats(p({ a: 61, b: 60 }), ["a", "b"])).not.toBeNull();
    expect(validateSeats(p({ x: 120 }), ["a"])).not.toBeNull();
    expect(validateSeats(p({ a: 120.5, b: -0.5 }), ["a", "b"])).not.toBeNull();
  });
  it("blocs", () => {
    const ids = ["a", "b", "c"];
    expect(validateBlocs({ mode: "custom", blocs: [bloc("x", ["a"], 60), bloc("y", ["b"], null)] }, ids)).toBeNull();
    expect(validateBlocs({ mode: "custom", blocs: [bloc("x", ["a"], 60), bloc("y", ["b"], 50)] }, ids)).toBeNull();
    expect(validateBlocs({ mode: "custom", blocs: [bloc("x", ["a"], 60), bloc("y", ["a"], null)] }, ids)).toBeNull();
    expect(validateBlocs({ mode: "custom", blocs: [bloc("x", ["a"], 0), bloc("y", ["b"], 120)] }, ids)).toBeNull();
    expect(validateBlocs({ mode: "custom", blocs: [1, 2, 3, 4, 5].map((i) => bloc(String(i), [], null)) }, ids)).toBeNull();
  });
});

describe("fillPct (guess by vote percentages)", () => {
  const ids = ["a", "b", "c", "d"];
  const shares = { a: 50, b: 30, c: 15, d: 4 }; // אחרות = 1%
  it("fills the remainder proportionally to the polls shares, keeping the 'others' share", () => {
    const r = fillPct(ids, { a: 0, b: 0, c: 0, d: 0 }, () => false, shares);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pct).toEqual({ a: 50, b: 30, c: 15, d: 4 });
    expect(r.changed).toEqual(ids);
  });
  it("respects locks and stays in tenths", () => {
    const r = fillPct(ids, { a: 40, b: 0, c: 0, d: 0 }, (id) => id === "a", shares);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pct.a).toBe(40);
    const sum = ids.reduce((s, id) => s + r.pct[id], 0);
    expect(sum).toBeCloseTo(40 + 60 * (49 / 50), 1);
    for (const id of ids) expect(Math.abs(r.pct[id] * 10 - Math.round(r.pct[id] * 10))).toBeLessThan(1e-9);
    expect(r.pct.b).toBeGreaterThan(r.pct.c);
  });
  it("errors when locked percentages exceed 100", () => {
    const r = fillPct(ids, { a: 60, b: 50, c: 0, d: 0 }, (id) => id === "a" || id === "b", shares);
    expect(r).toEqual({ ok: false, error: { kind: "pct-over", locked: 110 } });
  });
});

describe("validatePct (client mirror of the server rule)", () => {
  const ids = ["a", "b"];
  it("accepts tenths up to a sum of 100", () => {
    expect(validatePct({ a: 60.5, b: 39.5 }, ids)).toBeNull();
    expect(validatePct({ a: 10 }, ids)).toBeNull();
  });
  it("rejects bad values", () => {
    expect(validatePct({ a: 60.55 }, ids)).not.toBeNull();
    expect(validatePct({ a: 60, b: 40.1 }, ids)).toMatch(/יותר מ-100/);
    expect(validatePct({ x: 1 }, ids)).not.toBeNull();
    expect(validatePct({ a: -1 }, ids)).not.toBeNull();
  });
});

describe("אין 1–3 מנדטים בהשלמה", () => {
  it("רשימה פתוחה שיצאה מתחת לסף מקבלת 0, והמנדטים עוברים לרשימה עוברת", () => {
    const r = fillAll(["a", "b", "c"], {}, { a: 60, b: 58, c: 2 }, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = Object.values(r.seats).map((c) => c.v);
    expect(v.every((n) => n === 0 || n >= 4)).toBe(true);
    expect(v.reduce((a, b) => a + b, 0)).toBe(120);
    expect(r.seats.c.v).toBe(0);
  });
});
