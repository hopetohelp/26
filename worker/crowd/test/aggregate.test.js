import { describe, it, expect } from "vitest";
import { aggregate, suppress, seatStat, computeMatrix, computeVote2026, computeByVote, computeTrend, latestByUnit, israelDay, computeSeats } from "../lib/aggregate.js";
import { GOV37 } from "../lib/lists.js";
import { seats, ver, people, IDS } from "./helpers.js";

const NOW = "2026-10-05T12:00:00Z";
const run = (ps, vs, extra = {}) => aggregate({ participants: ps, versions: vs, now: NOW, aggregationId: "a", ...extra });

describe("seatStat", () => {
  it("mean/median/quartiles", () => {
    expect(seatStat("x", [1, 2, 3, 4])).toEqual({ list: "x", n: 4, mean: 2.5, median: 2.5, p25: 1.75, p75: 3.25 });
  });
});

describe("suppress", () => {
  it("hides below 10 and adds complementary suppression", () => {
    const c = suppress({ a: 50, b: 20, c: 5 }, 75);
    expect(c.c.hidden).toBe(true);
    expect(c.b.hidden).toBe(true); // הסתרה משלימה: הקטן הגלוי
    expect(c.a).toEqual({ n: 50, of: 75 });
  });
  it("9 vs 10", () => {
    expect(suppress({ a: 9, b: 9, c: 30 }, 48).a.hidden).toBe(true);
    expect(suppress({ a: 9, b: 9, c: 30 }, 48).c.hidden).toBeUndefined();
    expect(suppress({ a: 10, b: 30 }, 40).a).toEqual({ n: 10, of: 40 });
  });
});

describe("open threshold", () => {
  it("29 closed, 30 open", () => {
    const mk = (n) => people(n).map((p) => ver(p.id, "seats", seats(60)));
    expect(run(people(29), mk(29)).dashboard.open).toBe(false);
    const d = run(people(30), mk(30)).dashboard;
    expect(d.open).toBe(true);
    expect(d.seats.n).toBe(30);
    expect(d.participants).toBe(30);
  });
  it("only latest version per participant counts", () => {
    const vs = people(30).flatMap((p) => [ver(p.id, "seats", seats(10)), ver(p.id, "seats", seats(70))]);
    const d = run(people(30), vs).dashboard;
    expect(d.seats.full.find((s) => s.list === IDS[0]).mean).toBe(70);
  });
});

describe("seats section", () => {
  it("manual stats only among those with manual value, ≥10", () => {
    const vs = [...Array(12)].map((_, i) => ver("m" + i, "seats", seats(50, "manual"))).concat([...Array(9)].map((_, i) => ver("f" + i, "seats", seats(20, "filled"))));
    const s = computeSeats(vs);
    expect(s.manual.find((x) => x.list === IDS[0]).n).toBe(12);
    expect(s.usedFillAll).toBe(9);
    expect(s.starts.zero).toBe(21);
    expect(s.filledShare).toBeCloseTo(9 / 21, 2);
    expect(computeSeats(vs.slice(0, 9))).toBeNull();
    expect(s.modes).toEqual({ seats: 21, pct: 0 });
    expect(s.pctStats).toBeUndefined();
  });
  it("pct stats among pct-mode participants only, ≥10", () => {
    const pctV = (i) => ver("p" + i, "seats", seats(60, "filled", { mode: "pct", pct: { [IDS[0]]: 30 + i, [IDS[1]]: 40 } }));
    const base = [...Array(5)].map((_, i) => ver("s" + i, "seats", seats(50)));
    const s9 = computeSeats(base.concat([...Array(9)].map((_, i) => pctV(i))));
    expect(s9.modes).toEqual({ seats: 5, pct: 9 });
    expect(s9.pctStats).toBeUndefined();
    const s = computeSeats(base.concat([...Array(11)].map((_, i) => pctV(i))));
    const a = s.pctStats.find((x) => x.list === IDS[0]);
    expect(a).toMatchObject({ n: 11, mean: 35, median: 35, p25: 32.5, p75: 37.5 });
    expect(s.pctStats.find((x) => x.list === IDS[2]).mean).toBe(0);
  });
});

describe("blocs", () => {
  it("derived from gov37 flags and explicit from gov37 blocs", () => {
    const ps = people(30);
    const govId = IDS.find((id) => GOV37.has(id));
    const vs = ps.flatMap((p) => [
      ver(p.id, "seats", { seats: { [govId]: { v: 61, src: "manual", locked: true }, [IDS.find((i) => !GOV37.has(i))]: { v: 59, src: "manual", locked: true } }, start: "zero", pollsAsOf: null }),
      ver(p.id, "blocs", { mode: "gov37", blocs: [{ id: "gov", name: "", lists: [], target: 58 }, { id: "rest", name: "", lists: [], target: 62 }] }),
    ]);
    const b = run(ps, vs).dashboard.blocs;
    expect(b.derived.gov.mean).toBe(61);
    expect(b.derived.rest.mean).toBe(59);
    expect(b.explicit.gov.mean).toBe(58);
    expect(b.customCount).toBe(0);
  });
});

describe("matrix", () => {
  it("rows under 20 hidden with complementary suppression", () => {
    const vs = [];
    let i = 0;
    for (let k = 0; k < 40; k++) vs.push(ver("a" + i++, "vote", { v2022: "מחל", v2026: k < 30 ? "likud" : "yashar" }));
    for (let k = 0; k < 25; k++) vs.push(ver("a" + i++, "vote", { v2022: "פה", v2026: "yashar" }));
    for (let k = 0; k < 19; k++) vs.push(ver("a" + i++, "vote", { v2022: "ט", v2026: "otzma" }));
    const m = computeMatrix(vs, NOW);
    expect(m.rows["ט"]).toEqual({ n: 0, hidden: true, cells: {} });
    expect(m.rows["פה"].hidden).toBe(true); // הסתרה משלימה בין שורות
    expect(m.rows["מחל"].cells.likud).toEqual({ n: 30, of: 40 });
    expect(m.rows["מחל"].cells.yashar).toEqual({ n: 10, of: 40 });
  });
});

describe("vote2026", () => {
  it("all + named", () => {
    const vs = [...Array(15)].map((_, i) => ver("v" + i, "vote", { v2022: null, v2026: i < 10 ? "likud" : "undecided" }));
    const v = computeVote2026(vs);
    expect(v.all.likud.hidden).toBe(true); // הסתרה משלימה: אחרת 15-10 חושף את התא המוסתר
    expect(v.all.undecided.hidden).toBe(true);
    expect(v.named.likud).toEqual({ n: 10, of: 10 });
  });
});

describe("byVote subtraction guard", () => {
  it("drops a group within 10 of the overall total", () => {
    const vote = new Map();
    const seat = new Map();
    for (let i = 0; i < 25; i++) {
      vote.set("x" + i, ver("x" + i, "vote", { v2022: null, v2026: i < 20 ? "likud" : "yashar" }));
      seat.set("x" + i, ver("x" + i, "seats", seats(60)));
    }
    expect(computeByVote(vote, seat).likud).toBeUndefined(); // 25-20 = 5 < 10
    for (let i = 25; i < 40; i++) {
      vote.set("x" + i, ver("x" + i, "vote", { v2022: null, v2026: "yashar" }));
      seat.set("x" + i, ver("x" + i, "seats", seats(60)));
    }
    expect(computeByVote(vote, seat).likud.n).toBe(20);
  });
});

describe("5 distinct contributors rule", () => {
  const base = () => {
    const ps = people(30);
    return { ps, vs: ps.map((p) => ver(p.id, "seats", seats(60))) };
  };
  const prevFrom = (r) => Object.fromEntries(Object.entries(r.sections).map(([k, s]) => [k, s]));
  it("4 new contributors keep previous section frozen; 5 publish", () => {
    const { ps, vs } = base();
    const first = run(ps, vs);
    const four = [...vs, ...[0, 1, 2, 3].map((i) => ver(ps[i].id, "seats", seats(100)))];
    const r4 = run(ps, four, { previous: prevFrom(first), lastDailyDay: israelDay(NOW), now: "2026-10-05T13:00:00Z" });
    expect(r4.sections.seats.kept).toBe(true);
    expect(r4.dashboard.seats).toEqual(first.dashboard.seats);
    expect(r4.dashboard.sectionsAsOf.seats).toBe(NOW);
    const five = [...four, ver(ps[4].id, "seats", seats(100))];
    const r5 = run(ps, five, { previous: prevFrom(first), lastDailyDay: israelDay(NOW), now: "2026-10-05T13:00:00Z" });
    expect(r5.sections.seats.kept).toBeUndefined();
    expect(r5.dashboard.seats.full[0].mean).not.toBe(first.dashboard.seats.full[0].mean);
  });
  it("5 edits by one participant count as one", () => {
    const { ps, vs } = base();
    const first = run(ps, vs);
    const edits = [...vs, ...[1, 2, 3, 4, 5].map((k) => ver(ps[0].id, "seats", seats(60 + k)))];
    const r = run(ps, edits, { previous: prevFrom(first), lastDailyDay: israelDay(NOW), now: "2026-10-05T13:00:00Z" });
    expect(r.sections.seats.changed).toBe(1);
    expect(r.sections.seats.kept).toBe(true);
  });
  it("daily sections recomputed only after Israel midnight", () => {
    const { ps, vs } = base();
    const first = run(ps, vs);
    expect(first.daily).toBe(true);
    const same = run(ps, vs, { previous: prevFrom(first), lastDailyDay: israelDay(NOW) });
    expect(same.daily).toBe(false);
    expect(same.sections.matrix.kept).toBe(true);
    // 22:30 UTC = 01:30 בישראל ביום הבא
    const next = run(ps, vs, { previous: prevFrom(first), lastDailyDay: israelDay(NOW), now: "2026-10-05T22:30:00Z" });
    expect(next.daily).toBe(true);
  });
});

describe("review participants", () => {
  it("excluded from main and reported separately", () => {
    const ps = [...people(30), ...people(12, "r", 1)];
    const vs = ps.map((p) => ver(p.id, "seats", seats(p.review ? 0 : 60)));
    const d = run(ps, vs).dashboard;
    expect(d.participants).toBe(30);
    expect(d.seats.full[0].mean).toBe(60);
    expect(d.underReview.participants).toBe(12);
    expect(d.underReview.seats[0].mean).toBe(0);
  });
});

describe("trend", () => {
  it("end-of-day state by Israel day", () => {
    const vs = [];
    for (let i = 0; i < 10; i++) vs.push(ver("t" + i, "seats", seats(40), "2026-10-02T20:00:00Z")); // 23:00 ישראל, 2.10
    vs.push(ver("t0", "seats", seats(100), "2026-10-02T21:30:00Z")); // 00:30 ישראל, 3.10
    vs.push(ver("t10", "seats", seats(40), "2026-10-03T10:00:00Z"));
    const t = computeTrend(vs, "2026-10-05");
    expect(t.map((d) => d.day)).toEqual(["2026-10-02", "2026-10-03"]);
    expect(t[0]).toMatchObject({ n: 10, newcomers: 10, changed: 0 });
    expect(t[0].seats[IDS[0]]).toBe(40);
    expect(t[1]).toMatchObject({ n: 11, newcomers: 1, changed: 1 });
    expect(t[1].seats[IDS[0]]).toBeCloseTo((40 * 9 + 100 + 40) / 11, 1);
    expect(computeTrend(vs, "2026-10-03").length).toBe(1); // היום הנוכחי אינו נכלל
  });
  it("latestByUnit", () => {
    const m = latestByUnit([ver("a", "seats", seats(1), undefined, 5), ver("a", "seats", seats(2), undefined, 3)]);
    expect(m.seats.get("a").id).toBe(5);
  });
});
