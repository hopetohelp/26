import { describe, it, expect, beforeEach } from "vitest";
import { moderate, flagReasons, setPollRanges } from "../lib/moderation.js";
import { aggregate } from "../lib/aggregate.js";
import { ver, people } from "./helpers.js";

/** חלוקה: {list: seats}; השאר ל-likud כדי שהסכום יהיה 120 */
const guess = (parts) => {
  const rest = 120 - Object.values(parts).reduce((a, b) => a + b, 0);
  return { start: "zero", pollsAsOf: null, seats: Object.fromEntries(Object.entries({ likud: rest, ...parts }).map(([id, v]) => [id, { v, src: "manual", locked: true }])) };
};

describe("השערות חריגות", () => {
  // כלל 24.10.2026: ממתינה = רשימה שגם רחוקה לפחות 75% מממוצע המשתתפים וגם לפחות 7 מנדטים מחוץ לטווח הסקרים
  const RANGES = { likud: { lo: 0, hi: 120 }, yashar: { lo: 18, hi: 24 }, shas: { lo: 8, hi: 10 }, amcha: { lo: 0, hi: 5 } };
  beforeEach(() => setPollRanges(RANGES));
  const typical = (p) => ver(p, "seats", guess({ yashar: 20, shas: 10 }));
  // ממוצע המשתתפים: yashar 20, shas 10, amcha 0
  const MEANS = { yashar: 20, shas: 10, amcha: 0, likud: 90 };

  it("רחוקה 75% מממוצע המשתתפים וגם 5 מחוץ לטווח ⇐ ממתינה", () => {
    // yashar 36: מעל 1.75×20=35 ו-12 מעל הטווח
    expect(flagReasons(ver("c", "seats", guess({ yashar: 36, shas: 10 })), MEANS)).toEqual([{ list: "yashar", rule: "range", value: 36, lo: 18, hi: 24, mean: 20 }]);
    // yashar 34: 10 מעל הטווח, אבל פחות מ-75% מהממוצע ⇐ תקינה
    expect(flagReasons(ver("c", "seats", guess({ yashar: 34, shas: 10 })), MEANS)).toEqual([]);
    // מתחת: yashar 5 = רבע מהממוצע ומטה, 13 מתחת לטווח
    expect(flagReasons(ver("c", "seats", guess({ yashar: 5, shas: 10 })), MEANS)).toHaveLength(1);
  });

  it("רחוקה מהממוצע אבל פחות מ-7 מחוץ לטווח ⇐ תקינה (הכרעת בעלים 25.10.2026)", () => {
    // amcha 11: ממוצע 0 (כל מרחק הוא 75%+), אבל רק 6 מעל הטווח 0–5
    expect(flagReasons(ver("c", "seats", guess({ yashar: 20, shas: 10, amcha: 11 })), MEANS)).toEqual([]);
    expect(flagReasons(ver("c", "seats", guess({ yashar: 20, shas: 10, amcha: 12 })), MEANS)).toHaveLength(1);
  });

  it("moderate מחשב את ממוצע המשתתפים מההשערות עצמן", () => {
    const vs = Array.from({ length: 9 }, (_, i) => typical("p" + i));
    const odd = ver("c", "seats", guess({ yashar: 40, shas: 10 }));
    expect(moderate([...vs, odd]).pending.has(odd.id)).toBe(true);
    // אם כולם מנחשים 40 — הממוצע 40, וההשערה אינה רחוקה ממנו
    const same = Array.from({ length: 10 }, (_, i) => ver("q" + i, "seats", guess({ yashar: 40, shas: 10 })));
    expect(moderate(same).pending.size).toBe(0);
  });

  it("אישור מכניס, דחייה מוציאה, גרסה חדשה נבדקת מחדש", () => {
    const odd = ver("c", "seats", guess({ yashar: 40, shas: 10 }));
    const vs = [typical("a"), typical("b"), odd];
    expect(moderate(vs, new Map([[odd.id, "approved"]])).pending.size).toBe(0);
    expect(moderate(vs, new Map([[odd.id, "rejected"]])).rejected.has(odd.id)).toBe(true);
    const odd2 = ver("c", "seats", guess({ yashar: 41, shas: 10 }));
    expect(moderate([typical("a"), odd2], new Map([[odd.id, "approved"]])).pending.has(odd2.id)).toBe(true);
  });

  it("ממתינה שנכנסה לטווח (הסקרים זזו) ⇐ רגילה לבד", () => {
    const odd = ver("c", "seats", guess({ yashar: 40, shas: 10 }));
    expect(moderate([typical("a"), typical("b"), typical("d"), odd]).pending.size).toBe(1);
    setPollRanges({ ...RANGES, yashar: { lo: 18, hi: 36 } });
    expect(moderate([typical("a"), typical("b"), typical("d"), odd]).pending.size).toBe(0);
  });

  it("השערה שנדחתה ואינה חריגה עוד ⇐ נכנסת אוטומטית (הכרעת בעלים 26.10.2026)", () => {
    const odd = ver("c", "seats", guess({ yashar: 40, shas: 10 }));
    const vs = [typical("a"), typical("b"), typical("d"), odd];
    expect(moderate(vs, new Map([[odd.id, "rejected"]])).rejected.has(odd.id)).toBe(true);
    setPollRanges({ ...RANGES, yashar: { lo: 18, hi: 36 } });
    const m = moderate(vs, new Map([[odd.id, "rejected"]]));
    expect(m.rejected.has(odd.id)).toBe(false);
    expect(m.isExcluded(odd)).toBe(false);
  });

  it("השערה ממתינה לא נספרת בסטטיסטיקות, והמספר מוצג", () => {
    const ps = people(3);
    const vs = [ver("p0", "seats", guess({ yashar: 20, shas: 10 })), ver("p1", "seats", guess({ yashar: 20, shas: 10 })), ver("p2", "seats", guess({ yashar: 40, shas: 10 }))];
    const d = aggregate({ participants: ps, versions: vs, now: "2026-10-05T12:00:00Z", aggregationId: "a" }).dashboard;
    expect(d.pendingGuesses).toBe(1);
    expect(d.seats.n).toBe(2);
    expect(d.seats.full.find((s) => s.list === "yashar").mean).toBe(20);
    const ok = aggregate({ participants: ps, versions: vs, now: "2026-10-05T12:00:00Z", aggregationId: "a", decisions: new Map([[vs[2].id, "approved"]]) }).dashboard;
    expect(ok.pendingGuesses).toBe(0);
    expect(ok.seats.n).toBe(3);
  });

  it("מי שהשערת המפלגות שלו נדחתה: הגושים שלו לא נכנסים לסטטיסטיקה, ההצבעה שלו כן", () => {
    const ps = people(3);
    const bl = (name) => ({ mode: "custom", schemaVersion: 2, blocs: [{ id: "b", name, lists: ["likud", "yashar"], target: null }] });
    const vs = [
      ver("p0", "seats", guess({ yashar: 20, shas: 10 })), ver("p1", "seats", guess({ yashar: 20, shas: 10 })), ver("p2", "seats", guess({ yashar: 40, shas: 10 })),
      ver("p0", "vote", { v2022: "מחל", v2026: "likud" }), ver("p1", "vote", { v2022: "מחל", v2026: "likud" }), ver("p2", "vote", { v2022: "פה", v2026: "yashar" }),
      ver("p0", "blocs", bl("א")), ver("p1", "blocs", bl("א")), ver("p2", "blocs", bl("ב")),
    ];
    const run = (decisions) => aggregate({ participants: ps, versions: vs, now: "2026-10-05T12:00:00Z", aggregationId: "a", decisions });
    const rejected = run(new Map([[vs[2].id, "rejected"]]));
    expect(rejected.sections.vote2026.json.all.yashar).toBeDefined();
    expect(rejected.sections.blocs.contributors).toBe(2);
    expect(rejected.dashboard.participants).toBe(3);
    const approved = run(new Map([[vs[2].id, "approved"]]));
    expect(approved.sections.blocs.contributors).toBe(3);
  });
});
