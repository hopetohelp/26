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

  it("פי 1.5 מממוצע הגולשים ופער של לפחות 4.1 מנדטים ⇐ ממתינה", () => {
    const vs = [typical("a"), typical("b"), ver("c", "seats", guess({ yashar: 30, shas: 10 }))];
    const m = moderate(vs);
    expect(m.pending.size).toBe(1);
    expect(m.pending.get(vs[2].id)).toEqual([{ list: "yashar", rule: "ratio", value: 30, mean: 20 }]);
  });

  it("פי 1.5 בלי פער של 4.1 מנדטים ⇐ תקינה (פער 4.0 לא מספיק, 5 כן)", () => {
    const vs = [ver("a", "seats", guess({ amcha: 4 })), ver("b", "seats", guess({ amcha: 4 })), ver("c", "seats", guess({ amcha: 7 }))];
    expect(moderate(vs).pending.size).toBe(0);
    const four = [ver("a", "seats", guess({ amcha: 4 })), ver("b", "seats", guess({ amcha: 4 })), ver("c", "seats", guess({ amcha: 8 }))];
    expect(moderate(four).pending.size).toBe(0); // פי 2, אבל פער 4.0
    const five = [ver("a", "seats", guess({ amcha: 4 })), ver("b", "seats", guess({ amcha: 4 })), ver("c", "seats", guess({ amcha: 9 }))];
    expect(moderate(five).pending.size).toBe(1); // פי 2.25 ופער 5
  });

  it("הציבור החרדי, צבע שחור ונועם: מעבר הסף (4 ומעלה) ממתין לאישור, גם כשכל האחרים נתנו אותו דבר ומהמשתתף הראשון", () => {
    for (const list of ["haredi_public", "code_black", "noam"]) {
      const first = ver("a", "seats", guess({ [list]: 4 }));
      expect(moderate([first]).pending.get(first.id)).toEqual([{ list, rule: "watched", value: 4 }]);
      const vs = [ver("a", "seats", guess({ [list]: 5 })), ver("b", "seats", guess({ [list]: 5 }))];
      expect(moderate(vs).pending.size).toBe(2);
    }
  });

  it("רשימה נבחרת מתחת לסף (1–3) תקינה; מפלגה רגילה שעוברת את הסף אינה ממתינה רק בגלל שהסף עבר (הכלל הישן בוטל)", () => {
    const low = ver("a", "seats", guess({ noam: 3 }));
    expect(moderate([low]).pending.size).toBe(0);
    const withAmcha = (p) => ver(p, "seats", guess({ yashar: 20, shas: 10, amcha: 4 }));
    expect(moderate([withAmcha("a"), withAmcha("b"), withAmcha("c")]).pending.size).toBe(0);
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

  it("מי שהשערת המפלגות שלו נדחתה: גם ההצבעה שלו לא נכנסת לסטטיסטיקה", () => {
    const ps = people(3);
    const vs = [
      ver("p0", "seats", guess({ yashar: 20 })), ver("p1", "seats", guess({ yashar: 20 })), ver("p2", "seats", guess({ yashar: 40 })),
      ver("p0", "vote", { v2022: "מחל", v2026: "likud" }), ver("p1", "vote", { v2022: "מחל", v2026: "likud" }), ver("p2", "vote", { v2022: "פה", v2026: "yashar" }),
    ];
    const run = (decisions) => aggregate({ participants: ps, versions: vs, now: "2026-10-05T12:00:00Z", aggregationId: "a", decisions }).sections.vote2026.json;
    expect(run(new Map([[vs[2].id, "approved"]])).all.yashar).toBeDefined();
    const rejected = run(new Map([[vs[2].id, "rejected"]]));
    expect(rejected.all.yashar).toBeUndefined();
    expect(rejected.all.likud).toBeDefined();
  });
});
