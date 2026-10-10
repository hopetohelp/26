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
  it("חוסם 1–3 מנדטים גם בסכום 120, ומקבל 0 או 4", () => {
    for (const v of [1, 2, 3]) {
      expect(save("seats", seats(v)).error).toBe("threshold");
      expect(save("seats", seats(v, "filled", { mode: "pct", pct: { [IDS[0]]: 3, [IDS[1]]: 97 } })).error).toBe("threshold");
    }
    expect(save("seats", seats(0)).ok).toBe(true);
    expect(save("seats", seats(4)).ok).toBe(true);
    expect(save("seats", seats(0, "filled", { mode: "pct", pct: { [IDS[0]]: 3, [IDS[1]]: 97 } })).ok).toBe(true);
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
    // pct נשמר גם במצב seats — מנדטים ואחוזים מסונכרנים (הכרעת בעלים 10.10.2026), ונבדק באותה בדיקה
    expect(save("seats", seats(60, "manual", { mode: "seats", pct: { [IDS[0]]: 3 } })).value.payload.pct).toEqual({ [IDS[0]]: 3 });
    expect(save("seats", seats(60, "manual", { mode: "seats", pct: { [IDS[0]]: 101 } })).error).toBe("pct_value");
    // בלי אחוזים ⇐ מחושבים מהמנדטים (לכל השערה שמורה — גם מנדטים וגם אחוזים)
    expect(Object.keys(save("seats", seats(60)).value.payload.pct ?? {}).length).toBeGreaterThan(0);
    // המנדטים עדיין חייבים להסתכם ב-120
    const bad = seats(60, "filled", { mode: "pct", pct: { [IDS[0]]: 50 } });
    bad.seats[IDS[0]].v = 10;
    expect(save("seats", bad).error).toBe("sum");
  });
  it("blocs", () => {
    const b = (blocs) => validateBlocs({ mode: "custom", blocs });
    expect(b([{ id: "a", name: "", lists: [IDS[0]], target: 60 }, { id: "b", name: "", lists: [IDS[1]], target: null }]).ok).toBe(true);
    expect(b([{ id: "a", name: "", lists: [], target: 60 }, { id: "b", name: "", lists: [], target: 50 }]).ok).toBe(true);
    expect(b([{ id: "a", name: "", lists: [], target: 70 }, { id: "b", name: "", lists: [], target: null }, { id: "c", name: "", lists: [], target: 60 }]).ok).toBe(true);
    expect(b([{ id: "a", name: "", lists: [IDS[0]], target: null }, { id: "b", name: "", lists: [IDS[0]], target: null }]).ok).toBe(true);
    expect(b("abcdef".split("").map((id) => ({ id, name: "", lists: [], target: null }))).error).toBe("count");
  });
  it("שומר חמישה תרחישים חופפים ופרטי מחשבון; דוחה כפילות פנימית וקלט לא תקין", () => {
    const blocs = Array.from({length:5}, (_,i)=>({id:`b${i}`,name:`תרחיש ${i}`,lists:[IDS[0]],target:80}));
    expect(validateBlocs({mode:"custom",blocs}).ok).toBe(true);
    expect(validateBlocs({mode:"custom",blocs:[{...blocs[0],lists:[IDS[0],IDS[0]]}]}).error).toBe("overlap");
    const calculation = {eligible:7000000,turnout:71.5,agreements:[[IDS[0],IDS[1]]]};
    const input = {...seats(60), mode:"pct", pct:{[IDS[0]]:50,[IDS[1]]:50}, calculation};
    expect(save("seats",input).value.payload.calculation).toEqual(calculation);
    expect(save("seats",{...input,calculation:{...calculation,turnout:101}}).error).toBe("calculation");
    expect(save("seats",{...input,calculation:{...calculation,agreements:[[IDS[0],IDS[0]]]}}).error).toBe("calculation");
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

  it("מייל כשם משתמש: מתקבל באותיות קטנות, ונדחות כתובות פגומות", () => {
    expect(normalizeUsername("  Dani.Cohen+x@Gmail.COM ")).toEqual({ display: "dani.cohen+x@gmail.com", norm: "dani.cohen+x@gmail.com" });
    for (const bad of ["a@b", "@gmail.com", "a b@gmail.com", "a@@gmail.com", "a@gmail..", "<x>@gmail.com", "a@" + "b".repeat(260) + ".com"]) expect(normalizeUsername(bad)).toBeNull();
  });
});

it("שומר סכום קואליציה מחושב במנדטים ובאחוזים ומתעלם מערך לקוח", () => {
  for (const mode of ['seats', 'pct']) {
    const payload = { mode, start: 'zero', pollsAsOf: null, coalitionSeats: 119,
      seats: {likud:{v:30,src:'manual',locked:true},shas:{v:8,src:'filled',locked:false},utj:{v:7,src:'manual',locked:true},noam:{v:4,src:'manual',locked:true},code_black:{v:4,src:'manual',locked:true},democrats:{v:67,src:'manual',locked:true}},
      ...(mode === 'pct' ? {pct:{likud:25,shas:7,utj:6,democrats:62}} : {}) };
    expect(save('seats',payload).value.payload.coalitionSeats).toBe(49);
  }
});

import { allocate } from "../../../src/engine/baderOfer.ts";
import { sharesToVotes } from "../../../src/engine/pctForSeats.ts";
import { AGREEMENTS, ELIGIBLE } from "../lib/lists.js";
describe("אחוזים שמחושבים בשרת", () => {
  it("מחזירים לפי החוק בדיוק את המנדטים שנשמרו", () => {
    const ids = [...IDS];
    const s = save("seats", seats(60)).value.payload;
    const valid = Math.round(ELIGIBLE * 0.7 * (1 - 0.006));
    const r = allocate(sharesToVotes(ids, s.pct, valid), valid, AGREEMENTS);
    for (const id of ids) expect(r.seats[id] ?? 0).toBe(s.seats[id]?.v ?? 0);
  });
});
