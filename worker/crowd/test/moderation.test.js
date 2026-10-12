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
  // טווח סקרים לבדיקה (הכרעת בעלים 12.10.2026): חריגה = מעל פי 1.5 מהקצה העליון או מתחת לחצי מהתחתון, ובפער של 4.1 לפחות
  const RANGES = { likud: { lo: 0, hi: 120 }, yashar: { lo: 18, hi: 24 }, shas: { lo: 8, hi: 10 }, amcha: { lo: 0, hi: 5 } };
  beforeEach(() => setPollRanges(RANGES));
  const typical = (p) => ver(p, "seats", guess({ yashar: 20, shas: 10 }));

  it("מעל פי 1.5 מהקצה העליון ובפער של לפחות 4.1 ⇐ ממתינה", () => {
    const odd = ver("c", "seats", guess({ yashar: 36, shas: 10 }));
    const m = moderate([typical("a"), odd]);
    expect(m.pending.size).toBe(1);
    expect(m.pending.get(odd.id)).toEqual([{ list: "yashar", rule: "range", value: 36, lo: 18, hi: 24 }]);
    expect(moderate([ver("c", "seats", guess({ yashar: 35, shas: 10 }))]).pending.size).toBe(0); // מתחת לפי 1.5
  });

  it("מתחת לחצי מהקצה התחתון ובפער של לפחות 4.1 ⇐ ממתינה", () => {
    expect(flagReasons(ver("c", "seats", guess({ yashar: 9, shas: 10 })))).toEqual([{ list: "yashar", rule: "range", value: 9, lo: 18, hi: 24 }]);
    expect(flagReasons(ver("c", "seats", guess({ yashar: 10, shas: 10 })))).toEqual([]); // יותר מחצי
    // shas: חצי מ-8 = 4, אבל פער 4 בלבד ⇐ תקינה
    expect(flagReasons(ver("c", "seats", guess({ yashar: 20, shas: 4 })))).toEqual([]);
  });

  it("פי 1.5 בלי פער של 4.1 ⇐ תקינה (amcha: עד 5; 8 = פער 3, 10 = פער 5)", () => {
    expect(flagReasons(ver("c", "seats", guess({ yashar: 20, shas: 10, amcha: 8 })))).toEqual([]);
    expect(flagReasons(ver("c", "seats", guess({ yashar: 20, shas: 10, amcha: 10 })))).toHaveLength(1);
  });

  it("רשימה שלא נסקרה (טווח 0–0): 4.1 מנדטים ומעלה ⇐ ממתינה", () => {
    expect(flagReasons(ver("c", "seats", guess({ yashar: 20, shas: 10, democrats: 5 })))).toEqual([{ list: "democrats", rule: "range", value: 5, lo: 0, hi: 0 }]);
  });

  it("הציבור החרדי, צבע שחור ונועם: מעבר הסף (4 ומעלה) ממתין לאישור", () => {
    setPollRanges({ ...RANGES, haredi_public: { lo: 0, hi: 10 }, code_black: { lo: 0, hi: 10 }, noam: { lo: 0, hi: 10 } });
    for (const list of ["haredi_public", "code_black", "noam"]) {
      const first = ver("a", "seats", guess({ yashar: 20, shas: 10, [list]: 4 }));
      expect(moderate([first]).pending.get(first.id)).toEqual([{ list, rule: "watched", value: 4 }]);
      expect(moderate([ver("a", "seats", guess({ yashar: 20, shas: 10, [list]: 3 }))]).pending.size).toBe(0);
    }
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
    expect(moderate([odd]).pending.size).toBe(1);
    setPollRanges({ ...RANGES, yashar: { lo: 18, hi: 30 } });
    expect(moderate([odd]).pending.size).toBe(0);
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
