import { describe, it, expect } from "vitest";
import { moderate, flagReasons, baseline } from "../lib/moderation.js";
import { aggregate } from "../lib/aggregate.js";
import { ver, people } from "./helpers.js";

/** חלוקה: {list: seats}; השאר ל-likud כדי שהסכום יהיה 120 */
const guess = (parts) => {
  const rest = 120 - Object.values(parts).reduce((a, b) => a + b, 0);
  return { start: "zero", pollsAsOf: null, seats: Object.fromEntries(Object.entries({ likud: rest, ...parts }).map(([id, v]) => [id, { v, src: "manual", locked: true }])) };
};

describe("השערות חריגות", () => {
  const typical = (p) => ver(p, "seats", guess({ yashar: 20, shas: 10 }));

  it("פי 1.5 מממוצע הגולשים ו-3.5 מנדטים פער ⇐ ממתינה", () => {
    const vs = [typical("a"), typical("b"), ver("c", "seats", guess({ yashar: 30, shas: 10 }))];
    const m = moderate(vs);
    expect(m.pending.size).toBe(1);
    expect(m.pending.get(vs[2].id)).toEqual([{ list: "yashar", rule: "ratio", value: 30, mean: 20 }]);
  });

  it("פי 1.5 בלי פער של 3.5 מנדטים ⇐ תקינה", () => {
    const vs = [ver("a", "seats", guess({ amcha: 4 })), ver("b", "seats", guess({ amcha: 4 })), ver("c", "seats", guess({ amcha: 7 }))];
    expect(moderate(vs).pending.size).toBe(0);
  });

  it("מעבר אחוז החסימה כש-90% נתנו 0 ⇐ ממתינה, מהמשתתף השני", () => {
    const vs = [typical("a"), ver("c", "seats", guess({ yashar: 20, shas: 10, noam: 4 }))];
    const reasons = moderate(vs).pending.get(vs[1].id);
    expect(reasons.map((r) => r.rule)).toContain("zero");
  });

  it("משתתף ראשון לבד — אין למה להשוות", () => {
    expect(flagReasons(typical("a"), baseline([]))).toEqual([]);
  });

  it("אישור מכניס, דחייה מוציאה, גרסה חדשה נבדקת מחדש", () => {
    const odd = ver("c", "seats", guess({ yashar: 30, shas: 10 }));
    const vs = [typical("a"), typical("b"), odd];
    expect(moderate(vs, new Map([[odd.id, "approved"]])).pending.size).toBe(0);
    const r = moderate(vs, new Map([[odd.id, "rejected"]]));
    expect(r.rejected.has(odd.id)).toBe(true);
    const odd2 = ver("c", "seats", guess({ yashar: 31, shas: 10 }));
    expect(moderate([typical("a"), typical("b"), odd2], new Map([[odd.id, "approved"]])).pending.has(odd2.id)).toBe(true);
  });

  it("השערה ממתינה לא נספרת בסטטיסטיקות, והמספר מוצג", () => {
    const ps = people(3);
    const vs = [ver("p0", "seats", guess({ yashar: 20 })), ver("p1", "seats", guess({ yashar: 20 })), ver("p2", "seats", guess({ yashar: 40 }))];
    const d = aggregate({ participants: ps, versions: vs, now: "2026-10-05T12:00:00Z", aggregationId: "a" }).dashboard;
    expect(d.pendingGuesses).toBe(1);
    expect(d.seats.n).toBe(2);
    expect(d.seats.full.find((s) => s.list === "yashar").mean).toBe(20);
    const ok = aggregate({ participants: ps, versions: vs, now: "2026-10-05T12:00:00Z", aggregationId: "a", decisions: new Map([[vs[2].id, "approved"]]) }).dashboard;
    expect(ok.pendingGuesses).toBe(0);
    expect(ok.seats.n).toBe(3);
  });
});
