import { describe, expect, it } from "vitest";
import fc from "fast-check";
import results from "../data/results.json";
import { agreementsEffect, allocate, votesToNextSeat, type Agreement } from "./baderOfer";

type Election = (typeof results)[number];

const votesOf = (e: Election) => Object.fromEntries(e.lists.map((l) => [l.letters, l.votes]));
const officialOf = (e: Election) => Object.fromEntries(e.lists.map((l) => [l.letters, l.seats]));
const agreementsOf = (e: Election) => e.agreements.map(([a, b]) => [a, b] as Agreement);

describe("שחזור התוצאות הרשמיות של ועדת הבחירות", () => {
  for (const e of results) {
    it(`הכנסת ה-${e.knesset} (${e.label})`, () => {
      const r = allocate(votesOf(e), e.valid, agreementsOf(e));
      expect(r.status).toBe("ok");
      expect(r.seats).toEqual(officialOf(e));
      expect(Object.values(r.seats).reduce((a, b) => a + b, 0)).toBe(120);
    });
  }

  it("2022: בלי אף הסכם — הליכוד 31 והעבודה 5", () => {
    const e = results.find((x) => x.knesset === 25)!;
    expect(agreementsEffect(votesOf(e), e.valid, agreementsOf(e))).toEqual({ מחל: 1, אמת: -1 });
  });

  it("2022: הסכם העבודה–מרצ אינו פעיל כי מרצ לא עברה", () => {
    const e = results.find((x) => x.knesset === 25)!;
    const r = allocate(votesOf(e), e.valid, agreementsOf(e));
    expect(r.inactiveAgreements.map((x) => x.pair.join("+"))).toEqual(["אמת+מרצ"]);
    expect(r.quota).toBe(36227); // 4,347,342 ÷ 120 — החלק השלם
  });
});

describe("סף, מודד ומקרי גבול", () => {
  it("בדיוק 3.25% עובר; קול אחד פחות — לא", () => {
    const valid = 1_000_000;
    const exact = allocate({ a: 32_500, b: 967_500 }, valid);
    expect(exact.passing).toContain("a");
    const below = allocate({ a: 32_499, b: 967_501 }, valid);
    expect(below.passing).not.toContain("a");
    expect(below.seats.a).toBe(0);
  });

  it("מודד אפס ⇐ שגיאת תחום מפורשת", () => {
    expect(allocate({ a: 50, b: 50 }, 100).status).toBe("invalid_input");
  });

  it("קלט קטן שבו השלמים עולים על 120 ⇐ שגיאת תחום, לא תוצאה", () => {
    const r = allocate({ a: 499, b: 251, c: 250 }, 1000);
    expect(r.status).toBe("invalid_input");
  });

  it("הסכם לא תקין נדחה: עם עצמה, כפול, או רשימה שאינה קיימת", () => {
    expect(allocate({ a: 600_000, b: 400_000 }, 1_000_000, [["a", "a"]]).status).toBe("invalid_input");
    expect(allocate({ a: 1, b: 1, c: 1 }, 3, [["a", "b"], ["b", "c"]]).status).toBe("invalid_input");
    expect(allocate({ a: 600_000 }, 1_000_000, [["a", "z"]]).status).toBe("invalid_input");
  });

  it("כלל הרוב 81(ד)(4): רשימה בלי רוב קולות לא עוברת 60 מנדטים דרך העודפים", () => {
    // ל-a קצת פחות ממחצית, והיתר מפוצל לרשימות רבות קטנות — העודפים נוטים אליה
    const votes: Record<string, number> = { a: 4_990_000 };
    for (let i = 0; i < 12; i++) votes[`l${i}`] = 420_000 + i * 1_000;
    const valid = Object.values(votes).reduce((x, y) => x + y, 0);
    const r = allocate(votes, valid);
    expect(r.status).toBe("ok");
    expect(r.seats.a).toBeLessThanOrEqual(60);
  });

  it("שוויון מנות ⇐ 'נדרשת הגרלה' עם תוצאה חלקית", () => {
    const r = allocate({ a: 1_000_000, b: 1_000_000, c: 1_000_000 }, 3_000_000, [], { seats: 4 });
    expect(r.status).toBe("lottery_required");
    expect(r.tie?.units).toEqual(["a", "b", "c"]);
  });
});

describe("החלוקה הפנימית בזוג (82(ב)) — אורקל מחושב ביד", () => {
  it("זוג שזוכה בעודף: החלוקה הפנימית נותנת אותו לפי המנה הפנימית", () => {
    // 1,000,000 קולות, מודד 8,333. a: 300,000 (36 שלמים), b: 100,000 (12), c: 600,000 (72) ⇐ 120 בדיוק? בודקים עם זוג a+b
    const votes = { a: 299_000, b: 101_500, c: 599_500 };
    const valid = 1_000_000;
    const withPair = allocate(votes, valid, [["a", "b"]]);
    const sum = withPair.seats.a + withPair.seats.b;
    // מודד הזוג = (299,000 + 101,500) ÷ sum, חלק שלם; השלמים + עודף לפי מנה
    const pq = Math.floor((299_000 + 101_500) / sum);
    let sa = Math.floor(299_000 / pq);
    let sb = Math.floor(101_500 / pq);
    while (sa + sb < sum) {
      if (299_000 / (sa + 1) > 101_500 / (sb + 1)) sa++;
      else sb++;
    }
    expect([withPair.seats.a, withPair.seats.b]).toEqual([sa, sb]);
  });
});

describe("תכונות כלליות (בדיקות מבוססות-תכונה)", () => {
  const arbVotes = fc
    .array(fc.integer({ min: 0, max: 2_000_000 }), { minLength: 2, maxLength: 14 })
    .filter((xs) => xs.reduce((a, b) => a + b, 0) > 2_000_000);

  it("סכום המנדטים = 120 בכל תוצאה תקינה", () => {
    fc.assert(
      fc.property(arbVotes, (xs) => {
        const votes = Object.fromEntries(xs.map((v, i) => [`r${i}`, v]));
        const valid = xs.reduce((a, b) => a + b, 0);
        const r = allocate(votes, valid);
        if (r.status !== "ok") return true;
        return Object.values(r.seats).reduce((a, b) => a + b, 0) === 120;
      }),
      { numRuns: 300 },
    );
  });

  it("אי-תלות בסדר הקלט", () => {
    fc.assert(
      fc.property(arbVotes, (xs) => {
        const entries = xs.map((v, i) => [`r${i}`, v] as const);
        const valid = xs.reduce((a, b) => a + b, 0);
        const r1 = allocate(Object.fromEntries(entries), valid);
        const r2 = allocate(Object.fromEntries([...entries].reverse()), valid);
        return JSON.stringify(sortObj(r1.seats)) === JSON.stringify(sortObj(r2.seats));
      }),
      { numRuns: 200 },
    );
  });

  it("זוג שאחד מחבריו מתחת לסף ⇐ כאילו אין הסכם", () => {
    fc.assert(
      fc.property(arbVotes, fc.integer({ min: 1, max: 30_000 }), (xs, small) => {
        const votes: Record<string, number> = Object.fromEntries(xs.map((v, i) => [`r${i}`, v]));
        votes.tiny = small; // תמיד מתחת לסף בהינתן סך > 2 מיליון
        const valid = Object.values(votes).reduce((a, b) => a + b, 0);
        const withA = allocate(votes, valid, [["r0", "tiny"]]);
        const without = allocate(votes, valid);
        if (withA.status !== "ok" || without.status !== "ok") return true;
        return JSON.stringify(sortObj(withA.seats)) === JSON.stringify(sortObj(without.seats));
      }),
      { numRuns: 200 },
    );
  });

  it("מונוטוניות בקולות של הרשימה עצמה (תוספת לא מורידה מנדט)", () => {
    fc.assert(
      fc.property(arbVotes, fc.integer({ min: 1, max: 300_000 }), (xs, add) => {
        const votes = Object.fromEntries(xs.map((v, i) => [`r${i}`, v]));
        const valid = xs.reduce((a, b) => a + b, 0);
        const before = allocate(votes, valid);
        const after = allocate({ ...votes, r0: votes.r0 + add }, valid + add);
        if (before.status !== "ok" || after.status !== "ok") return true;
        return after.seats.r0 >= before.seats.r0;
      }),
      { numRuns: 300 },
    );
  });
});

describe("כמה קולות למנדט הבא", () => {
  it("2022: התשובה מאומתת מקומית — בדיוק ברף, וקול אחד פחות אינו מספיק", () => {
    const e = results.find((x) => x.knesset === 25)!;
    const votes = votesOf(e);
    const x = votesToNextSeat(votes, e.valid, "אמת", agreementsOf(e));
    expect(x).not.toBeNull();
    const at = allocate({ ...votes, אמת: votes["אמת"] + x! }, e.valid + x!, agreementsOf(e));
    const before = allocate({ ...votes, אמת: votes["אמת"] + x! - 1 }, e.valid + x! - 1, agreementsOf(e));
    expect(at.seats["אמת"]).toBe(5);
    expect(before.seats["אמת"]).toBe(4);
  });
});

function sortObj(o: Record<string, number>) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
}
