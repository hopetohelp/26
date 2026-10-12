import { describe, expect, it } from "vitest";
import modelFile from "../data/model.json";
import { POLL_AVERAGE } from "./sources";
import { latestPerPollster, lists2026, listName, passesInAll, passesInNone, seatsIn } from "./data";
import { dayMonth, buildHome, type HomeModel } from "./home";
import { HALL, hemicycleSeats } from "./hemicycle";

/** התפלגות מלאכותית: counts מתחילים במנדט `from` (לפניו אפסים) */
const hist = (from: number, counts: number[]) => [...Array(from).fill(0), ...counts];

const fixture: HomeModel = {
  asof: "2026-10-08",
  start: "2026-09-09",
  polls: 5,
  central: { seats: { a: 40, b: 30, c: 20, d: 18, e: 6, f: 0, g: 0, h: 0, i: 6, j: 0 } },
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
      // i: עוברת ב-99.9% מהתרחישים, אבל סקר אחד מהאחרונים לא מעביר אותה ⇐ בסיכון (הקביעה לפי הסקרים, לא לפי התרחישים)
      i: { seats: [5, 6, 7], pass: 0.999, seatsMean: 6 },
      // j: לא עוברת כמעט באף תרחיש, אבל סקר אחד נותן לה מנדטים ⇐ בסיכון, לא "מתחת לסף"
      j: { seats: [0, 0, 0], pass: 0.002, seatsMean: 0.1 },
    },
    bloc: { seats: [46, 52, 58], seatsHist: hist(44, [1, 3, 6, 9, 12, 9, 6, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1]) },
  },
  trend: [
    { date: "2026-09-09", seats: { a: 38, b: 30, c: 20, d: 18, e: 14 } },
    { date: "2026-10-08", seats: { a: 40, b: 30, c: 20, d: 18, e: 12 } },
  ],
};
const opts = {
  govIds: ["a", "b", "e"],
  nameOf: (id: string) => id.toUpperCase(),
  // לפי הסקרים האחרונים: a–d עוברות בכולם; g לא עוברת באף אחד; e, f, h, i, j — בחלק מהם
  sure: (id: string) => ["a", "b", "c", "d"].includes(id),
  out: (id: string) => id === "g",
};

describe("buildHome", () => {
  const h = buildHome(fixture, opts);

  it("מנדטי הממשלה היוצאת = סכום הממוצעים של הרשימות (לא חציון התרחישים), והשאר משלימים ל-120", () => {
    expect(h.gov).toBe(76);
    expect(h.other).toBe(44);
    expect(h.gov + h.other).toBe(120);
    expect(h.blocLo).toBe(46);
    expect(h.blocHi).toBe(58);
  });

  it("כל רשימה בקבוצה אחת בדיוק: מעל הקו, על הסף, או מתחת לסף", () => {
    const all = [...h.safe, ...h.edge, ...h.below].map((r) => r.id).sort();
    expect(all).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    expect(h.safe.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(h.below.map((r) => r.id)).toEqual(["g"]);
  });

  it("🔴 הסיכון לפי הסקרים האחרונים בלבד (הכרעה 4), לא לפי התרחישים", () => {
    // i עוברת ב-99.9% מהתרחישים, וגם j שכמעט לא עוברת בתרחישים — שתיהן בסיכון כי לפחות סקר אחד לא מעביר אותן
    expect(h.edge.map((r) => r.id)).toContain("i");
    expect(h.edge.map((r) => r.id)).toContain("j");
    // g לא עוברת באף סקר ⇐ מתחת לסף, גם אם בתרחישים יש לה שבריר
    expect(h.below.map((r) => r.id)).toEqual(["g"]);
  });

  it("במסך התרחישים: הסיכון שעולה מהתרחישים בלבד — עוברות בחלק מהתרחישים", () => {
    expect(h.scenarioEdge.map((r) => r.id).sort()).toEqual(["e", "f", "h"]);
  });

  it("הסדר לפי הממוצע, ובשוויון לפי ממוצע התרחישים", () => {
    expect(h.safe.map((r) => r.central)).toEqual([40, 30, 20, 18]);
    // e ו-i בממוצע 6: e קודמת (ממוצע התרחישים 10.5 מול 6); f, h, j בלי מנדטים: לפי ממוצע התרחישים
    expect(h.edge.map((r) => r.id)).toEqual(["e", "i", "f", "h", "j"]);
  });

  it("הטווח של רשימה ושל הגוש הוא טווח 80% מהתרחישים (כלל הטווחים: תרחישים ⇐ 80%), וההתפלגות רחבה ממנו", () => {
    const a = h.safe.find((r) => r.id === "a")!;
    expect([a.lo, a.hi]).toEqual([35, 45]);
    expect([h.blocLo, h.blocHi]).toEqual([46, 58]);
    // ההתפלגות מגיעה מ-30 עד 46 (טווח מלא), והנר נחתך ל-35 עד 45
    expect(a.hist.findIndex((c) => c > 0)).toBe(30);
    expect(a.hist.length - 1).toBe(46);
  });

  it("המגמה: סכום מנדטי הממשלה היוצאת בכל יום", () => {
    expect(h.series).toEqual([{ date: "2026-09-09", v: 82 }, { date: "2026-10-08", v: 82 }]);
  });
});

describe("הבית מהנתונים האמיתיים", () => {
  const model = modelFile as unknown as HomeModel;
  const latest = latestPerPollster(POLL_AVERAGE.asOf, 14);
  const h = buildHome(model, {
    govIds: lists2026.filter((l) => l.gov37).map((l) => l.id),
    nameOf: listName,
    sure: (id) => passesInAll(latest, id),
    out: (id) => passesInNone(latest, id),
  });

  it("🔴 רשימה מעל הקו רק אם כל הסקרים האחרונים, כולל הפסימי ביותר עבורה, מעבירים אותה (הכרעה 4)", () => {
    for (const r of h.safe) expect(latest.every((p) => seatsIn(p, r.id) === undefined || seatsIn(p, r.id)! > 0)).toBe(true);
    for (const r of h.edge) {
      const xs = latest.map((p) => seatsIn(p, r.id)).filter((x): x is number => typeof x === "number");
      expect(xs.some((x) => x === 0)).toBe(true);
      expect(xs.some((x) => x > 0)).toBe(true);
    }
    for (const r of h.below) expect(latest.some((p) => seatsIn(p, r.id)! > 0)).toBe(false);
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
      // טווח 80% בתוך ההתפלגות המלאה
      expect(r.hist.findIndex((c) => c > 0)).toBeLessThanOrEqual(r.lo);
      expect(r.hist.length - 1).toBeGreaterThanOrEqual(r.hi);
    }
  });

  it("לכל רשימה התפלגות של 20,000 תרחישים, ולגוש גם", () => {
    for (const r of [...h.safe, ...h.edge, ...h.below]) expect(r.hist.reduce((a, c) => a + c, 0)).toBe(20000);
    expect(h.blocHist.reduce((a, c) => a + c, 0)).toBe(20000);
  });
});

describe("hemicycleSeats", () => {
  it("פרסה: 120 מושבים, 58 בכל צד ו-4 בציר האמצע, סימטרית, בלי מושבים חופפים", () => {
    const s = hemicycleSeats();
    expect(s).toHaveLength(120);
    const rows = [...new Set(s.map((p) => Math.round(p.y * 1000)))];
    expect(s.filter((p) => p.x < HALL.cx - 1e-9)).toHaveLength(58);
    expect(s.filter((p) => p.x > HALL.cx + 1e-9)).toHaveLength(58); // ועוד 4 מושבים בציר האמצע של הקשת
    for (const p of s) expect(s.some((q) => Math.abs(q.x - (HALL.w - p.x)) < 1e-9 && Math.abs(q.y - p.y) < 1e-9)).toBe(true);
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) expect(Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y)).toBeGreaterThan(2 * HALL.r);
    expect(rows.length).toBeGreaterThan(10);
  });
  it("120 מושבים, מסודרים מהקצה הימני, והמושב הראשון בשורה החיצונית", () => {
    const s = hemicycleSeats();
    expect(s).toHaveLength(120);
    expect(s[0].a).toBe(0);
    expect(s[119].a).toBeCloseTo(Math.PI);
    for (let i = 1; i < s.length; i++) expect(s[i].a).toBeGreaterThanOrEqual(s[i - 1].a);
  });
});

describe("dayMonth", () => {
  it("יום וחודש בלי אפס מוביל", () => expect(dayMonth("2026-09-09")).toBe("9/9"));
});

describe("לוח המושבים בבית: שלושה גושים", () => {
  it("גוש נתניהו, המפלגות הערביות וגוש אייזנקוט מסתכמים ל-120", async () => {
    const { HOME } = await import("./homeData");
    const { coalition, arab, opposition } = HOME.blocs;
    expect(coalition + arab + opposition).toBe(120);
    expect(arab).toBeGreaterThanOrEqual(0);
  });
});

it("הנקודה האחרונה במגמת הממשלה היוצאת שווה למספר בכותרת ובלוח המושבים (מספר אחד לכל עובדה)", async () => {
  const { GOV_POINTS, HOME: home } = await import("./homeData");
  expect(GOV_POINTS[GOV_POINTS.length - 1].mean).toBe(home.gov);
  expect(GOV_POINTS.every((p) => typeof p.mean === "number")).toBe(true);
});
