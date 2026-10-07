import { describe, it, expect } from "vitest";
import { validateSave, normalizeUsername, passwordProblem, validateBlocs } from "../lib/validate.js";
import { seats, IDS } from "./helpers.js";

const save = (unit, payload) => validateSave({ unit, op_id: "op-12345678", registry: "r", payload });
describe("validate", () => {
  it("vote codes", () => {
    expect(save("vote", { v2022: "מחל", v2026: "undecided" }).ok).toBe(true);
    expect(save("vote", { v2022: "blank", v2026: null }).ok).toBe(true);
    expect(save("vote", { v2022: "undecided", v2026: null }).ok).toBe(false);
    expect(save("vote", { v2022: null, v2026: "blank" }).ok).toBe(false);
    expect(save("vote", { v2022: null, v2026: null }).ok).toBe(false);
  });
  it("seats", () => {
    expect(save("seats", seats(60)).ok).toBe(true);
    const bad = seats(60);
    bad.seats[IDS[0]].v = 61;
    expect(save("seats", bad).error).toBe("sum");
    expect(save("seats", { ...seats(60), seats: { nope: { v: 120, src: "manual", locked: true } } }).error).toBe("list");
    const frac = seats(60);
    frac.seats[IDS[0]].v = 59.5;
    frac.seats[IDS[1]].v = 60.5;
    expect(save("seats", frac).ok).toBe(false);
  });
  it("seats by vote percentages (mode pct)", () => {
    const pct = (p) => save("seats", seats(60, "filled", { mode: "pct", pct: p }));
    expect(pct({ [IDS[0]]: 40.5, [IDS[1]]: 50 }).ok).toBe(true);
    expect(pct({ [IDS[0]]: 40.5, [IDS[1]]: 50 }).value.payload.pct).toEqual({ [IDS[0]]: 40.5, [IDS[1]]: 50 });
    expect(pct({ [IDS[0]]: 50, [IDS[1]]: 50.05 }).error).toBe("pct_value"); // שתי ספרות
    expect(pct({ [IDS[0]]: 60, [IDS[1]]: 40.1 }).error).toBe("pct_sum");
    expect(pct({ [IDS[0]]: -1 }).error).toBe("pct_value");
    expect(pct({ [IDS[0]]: 101 }).error).toBe("pct_value");
    expect(pct({ nope: 3 }).error).toBe("list");
    expect(pct(undefined).error).toBe("pct");
    expect(save("seats", seats(60, "manual", { mode: "x" })).error).toBe("mode");
    // בלי mode — ניחוש לפי מנדטים (גרסאות ישנות)
    expect(save("seats", seats(60)).value.payload.mode).toBe("seats");
    // pct נשמר רק במצב pct
    expect(save("seats", seats(60, "manual", { mode: "seats", pct: { [IDS[0]]: 3 } })).value.payload.pct).toBeUndefined();
    // המנדטים עדיין חייבים להסתכם ב-120
    const bad = seats(60, "filled", { mode: "pct", pct: { [IDS[0]]: 50 } });
    bad.seats[IDS[0]].v = 10;
    expect(save("seats", bad).error).toBe("sum");
  });
  it("blocs", () => {
    const b = (blocs) => validateBlocs({ mode: "custom", blocs });
    expect(b([{ id: "a", name: "", lists: [IDS[0]], target: 60 }, { id: "b", name: "", lists: [IDS[1]], target: null }]).ok).toBe(true);
    expect(b([{ id: "a", name: "", lists: [], target: 60 }, { id: "b", name: "", lists: [], target: 50 }]).error).toBe("sum");
    expect(b([{ id: "a", name: "", lists: [], target: 70 }, { id: "b", name: "", lists: [], target: null }, { id: "c", name: "", lists: [], target: 60 }]).error).toBe("sum");
    expect(b([{ id: "a", name: "", lists: [IDS[0]], target: null }, { id: "b", name: "", lists: [IDS[0]], target: null }]).error).toBe("overlap");
    expect(b("abcde".split("").map((id) => ({ id, name: "", lists: [], target: null }))).error).toBe("count");
  });
  it("username", () => {
    expect(normalizeUsername("Dani_1").norm).toBe("dani_1");
    expect(normalizeUsername("דני12").norm).toBe("דני12");
    expect(normalizeUsername("דניDani")).toBeNull();
    expect(normalizeUsername("ab")).toBeNull();
    expect(normalizeUsername("Ｄａｎｉ").norm).toBe("dani"); // NFKC
  });
  it("password", () => {
    expect(passwordProblem("short")).toBe("short");
    expect(passwordProblem("1234567890")).toBe("common");
    expect(passwordProblem("123456")).toBe("common");
    expect(passwordProblem("abc12x")).toBeNull();
    expect(passwordProblem("a1b2c")).toBe("short");
    expect(passwordProblem("x".repeat(129))).toBe("long");
    expect(passwordProblem("correct horse battery")).toBeNull();
  });
});
