import { describe, expect, it } from "vitest";
import modelFile from "../data/model.json";
import { lastPollDate, latestPerPollster, lists2026, listName, passesInAll } from "./data";
import { dayMonth, buildHome, type HomeModel } from "./home";
import { hemicycleSeats } from "./hemicycle";

/** התפלגות מלאכותית: counts מתחילים במנדט `from` (לפניו אפסים) */
const hist = (from: number, counts: number[]) => [...Array(from).fill(0), ...counts];

const fixture: HomeModel = {
  asof: "2026-10-08",
  start: "2026-09-09",
  polls: 5,
  central: { seats: { a: 40, b: 30, c: 20, d: 18, e: 12, f: 0, g: 0, h: 0 } },
  scenarios: {
    lists: {
      a: { seats: [35, 40, 45], pass: 1, seatsMean: 40, seatsHist: hist(30, [1, 1, 2, 3, 5, 7, 9, 12, 9, 7, 5, 3, 2, 1, 1, 1, 1]) },
      b: { seats: [25, 30, 35], pass: 1, seatsMean: 30 },
      c: { seats: [15, 20, 25], pass: 1, seatsMean: 20 },
      d: { seats: [14, 18, 22], pass: 1, seatsMean: 18 },
      e: { seats: [0, 12, 40], pass: 0.9, seatsMean: 10.5 },
      f: { seats: [0, 0, 6], pass: 0.4, seatsMean: 2.3 },
      g: { seats: [0, 0, 0], pass: 0.0001, seatsMean: 0 },
      h: { seats: [0, 0, 0], pass: 0.5, seatsMean: 1.1 },
    },
    bloc: { seats: [46, 52, 58], seatsHist: hist(44, [1, 3, 6, 9, 12, 9, 6, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1]) },
  },
  trend: [
    { date: "2026-09-09", seats: { a: 38, b: 30, c: 20, d: 18, e: 14 } },
    { date: "2026-10-08", seats: { a: 40, b: 30, c: 20, d: 18, e: 12 } },
  ],
};
const opts = { govIds: ["a", "b", "e"], nameOf: (id: string) => id.toUpperCase(), sure: (id: string) => ["a", "b", "c", "d"].includes(id) };

describe("buildHome", () => {
  const h = buildHome(fixture, opts);

  it("מנדטי הממשלה היוצאת = סכום הממוצעים של הרשימות (לא חציון התרחישים), והשאר משלימים ל-120", () => {
    expect(h.gov).toBe(82);
    expect(h.other).toBe(38);
    expect(h.gov + h.other).toBe(120);
    expect(h.blocLo).toBe(46);
    expect(h.blocHi).toBe(58);
  });

  it("כל רשימה בקבוצה אחת בדיוק: מעל הקו, על הסף, או מתחת לסף", () => {
    const all = [...h.safe, ...h.edge, ...h.below].map((r) => r.id).sort();
    expect(all).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(h.safe.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    // e: ממוצע 12 אבל לא עוברת בכל הסקרים ו-90% מהתרחישים ⇐ על הסף, כמו "המצב היום"
    expect(h.edge.map((r) => r.id)).toEqual(["e", "f", "h"]);
    expect(h.below.map((r) => r.id)).toEqual(["g"]);
  });

  it("הסדר לפי הממוצע, ובשוויון לפי ממוצע התרחישים", () => {
    expect(h.safe.map((r) => r.central)).toEqual([40, 30, 20, 18]);
    // f ו-h בלי מנדטים בממוצע: f קודמת כי ממוצע המנדטים שלה בתרחישים גבוה (2.3 מול 1.1)
    expect(h.edge.map((r) => r.id)).toEqual(["e", "f", "h"]);
  });

  it("הטווח המלא הוא הנמוך והגבוה מכל התרחישים, והוא רחב מטווח 80%", () => {
    const a = h.safe.find((r) => r.id === "a")!;
    expect([a.fullLo, a.fullHi]).toEqual([30, 46]);
    expect(a.fullLo).toBeLessThanOrEqual(a.lo);
    expect(a.fullHi).toBeGreaterThanOrEqual(a.hi);
    expect([h.blocFullLo, h.blocFullHi]).toEqual([44, 60]);
  });

  it("המגמה: סכום מנדטי הממשלה היוצאת בכל יום", () => {
    expect(h.series).toEqual([{ date: "2026-09-09", v: 82 }, { date: "2026-10-08", v: 82 }]);
  });
});

describe("הבית מהנתונים האמיתיים", () => {
  const model = modelFile as unknown as HomeModel;
  const latest = latestPerPollster(lastPollDate(), 14);
  const h = buildHome(model, {
    govIds: lists2026.filter((l) => l.gov37).map((l) => l.id),
    nameOf: listName,
    sure: (id) => passesInAll(latest, id),
  });

  it("הכותרת, הלוח והדירוג מציגים את אותו מספר: סכום הממוצעים של מפלגות הממשלה היוצאת", () => {
    const fromRows = [...h.safe, ...h.edge, ...h.below].filter((r) => lists2026.find((l) => l.id === r.id)?.gov37).reduce((a, r) => a + r.central, 0);
    expect(h.gov).toBe(fromRows);
    expect(h.gov + h.other).toBe(120);
  });

  it("סכום הממוצעים של כל הרשימות הוא 120, וכל רשימה מופיעה פעם אחת", () => {
    const all = [...h.safe, ...h.edge, ...h.below];
    expect(all.reduce((a, r) => a + r.central, 0)).toBe(120);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    expect(all.length).toBe(Object.keys(model.scenarios.lists).length);
  });

  it("נקודת הסיום של המגמה היא אותו מספר כמו בכותרת", () => {
    expect(h.series[h.series.length - 1].v).toBe(h.gov);
  });

  it("הממוצע של כל רשימה נמצא בתוך טווח 80% שלה, וטווח 80% בתוך הטווח המלא", () => {
    for (const r of [...h.safe, ...h.edge, ...h.below]) {
      expect(r.lo).toBeLessThanOrEqual(r.central);
      expect(r.hi).toBeGreaterThanOrEqual(r.central);
      expect(r.fullLo).toBeLessThanOrEqual(r.lo);
      expect(r.fullHi).toBeGreaterThanOrEqual(r.hi);
    }
  });

  it("לכל רשימה התפלגות של 20,000 תרחישים, ולגוש גם", () => {
    for (const r of [...h.safe, ...h.edge, ...h.below]) expect(r.hist.reduce((a, c) => a + c, 0)).toBe(20000);
    expect(h.blocHist.reduce((a, c) => a + c, 0)).toBe(20000);
  });
});

describe("hemicycleSeats", () => {
  it("120 מושבים, מסודרים מהקצה הימני, והמושב הראשון בשורה החיצונית", () => {
    const s = hemicycleSeats();
    expect(s).toHaveLength(120);
    expect(s[0].a).toBe(0);
    expect(s[119].a).toBeCloseTo(Math.PI);
    for (let i = 1; i < s.length; i++) expect(s[i].a).toBeGreaterThanOrEqual(s[i - 1].a);
  });
});

describe("dayMonth", () => {
  it("יום וחודש בלי אפס מוביל", () => expect(dayMonth("2026-09-09")).toBe("9.9"));
});
