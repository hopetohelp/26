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
    expect(passwordProblem("x".repeat(129))).toBe("long");
    expect(passwordProblem("correct horse battery")).toBeNull();
  });
});
