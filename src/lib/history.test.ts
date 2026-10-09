import { describe, expect, it } from "vitest";
import historyFile from "../data/history.json";
import resultsFile from "../data/results.json";
import pollsFile from "../data/polls.json";
import {
  EVE_DAYS,
  compareLists,
  eveSnapshot,
  familyRows,
  pollGap,
  pollsterRecords,
  summarizeCycle,
  toTime,
  totalGap,
  type Cycle,
  type ElectionResult,
  type HistPoll,
} from "./history";

const cycles = historyFile.cycles as unknown as Cycle[];
const results = resultsFile as unknown as ElectionResult[];
const resultOf = (c: Cycle) => results.find((r) => r.id === c.id)!;

/** "סקר" שהוא התוצאה עצמה — הפער שלו חייב להיות אפס */
function perfectPoll(c: Cycle): HistPoll {
  const r = resultOf(c);
  return {
    id: "perfect", start: c.date, end: c.date, firmKey: "x", firmHe: "x", publisherHe: null, seatSum: 120, consistent: true, urls: [],
    values: Object.fromEntries(r.lists.map((l) => [l.letters, l.seats > 0 ? { s: l.seats } : { p: (l.votes / r.valid) * 100 }])),
  };
}

describe("נתוני המערכות הקודמות", () => {
  it("חמש מערכות, לכל אחת תוצאה רשמית וסקרים", () => {
    expect(cycles.map((c) => c.id)).toEqual(["k21", "k22", "k23", "k24", "k25"]);
    for (const c of cycles) {
      expect(resultOf(c)).toBeDefined();
      expect(c.polls.length).toBeGreaterThan(30);
    }
  });

  it("כל אותיות הסקרים וגוש ההמלצה קיימות בתוצאות הרשמיות של אותה מערכת", () => {
    for (const c of cycles) {
      const letters = new Set(resultOf(c).lists.map((l) => l.letters));
      for (const p of c.polls) for (const k of Object.keys(p.values)) expect(letters.has(k), `${p.id}: ${k}`).toBe(true);
      for (const k of c.recommendedNetanyahu) expect(letters.has(k)).toBe(true);
    }
  });

  it("גוש ההמלצה על נתניהו תואם את מספר הממליצים שדווח (65 · 55 · 58 · 52 · 64)", () => {
    const seats = cycles.map((c) => c.recommendedNetanyahu.reduce((a, x) => a + resultOf(c).lists.find((l) => l.letters === x)!.seats, 0));
    expect(seats).toEqual([65, 55, 58, 52, 64]);
  });

  it("אין סקר מיום הבחירות או אחריו (מדגמי הקלפיות אינם סקר)", () => {
    for (const c of cycles) for (const p of c.polls) expect(p.end < c.date, p.id).toBe(true);
  });
});

describe("שמות בעברית בלבד בממשק", () => {
  const BRANDS = ["NEXT DATA", "Panel4All", "i24NEWS", "103FM", "DRI", "HOT"];
  const latin = (s: string | null) => !!s && /[A-Za-z]/.test(BRANDS.reduce((a, b) => a.split(b).join(""), s));
  it("מכונים ומזמינים — סקרי המערכות הקודמות", () => {
    for (const c of cycles) for (const p of c.polls) expect(latin(p.firmHe) || latin(p.publisherHe), `${p.id}: ${p.firmHe} · ${p.publisherHe}`).toBe(false);
  });
  // בפרסום האוטומטי (AUTO_INGEST) מכון חדש יכול להופיע באנגלית עד שיתווסף תרגום — זה אינו חוסם פרסום
  (process.env.AUTO_INGEST ? it.skip : it)("מכונים ומזמינים — סקרי 2026", () => {
    for (const p of pollsFile.polls) expect(latin(p.firmHe) || latin(p.publisherHe), `${p.id}: ${p.firmHe} · ${p.publisherHe}`).toBe(false);
  });
  it("שורת תוצאות בחירות אינה נספרת כסקר", () => {
    expect(pollsFile.polls.some((p) => /election/i.test(p.firm))).toBe(false);
  });
});

describe("ערב הבחירות — אותה שיטה כמו 'המצב היום'", () => {
  it("סקר אחד לכל מכון+מזמין, ורק מ-14 הימים שלפני הבחירות", () => {
    for (const c of cycles) {
      const snap = eveSnapshot(c);
      const keys = snap.map((p) => `${p.firmKey}|${p.publisherHe}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const p of snap) {
        expect(p.consistent).toBe(true);
        expect(toTime(p.end)).toBeLessThan(toTime(c.date));
        expect(toTime(p.end)).toBeGreaterThan(toTime(c.date) - (EVE_DAYS + 1) * 86_400_000);
      }
    }
  });

  it("'סקר' שהוא התוצאה עצמה — פער אפס, והגוש שווה לתוצאה", () => {
    for (const c of cycles) {
      const rows = compareLists(c, resultOf(c), [perfectPoll(c)]);
      expect(totalGap(rows)).toBe(0);
      expect(rows.some((r) => r.thresholdMiss)).toBe(false);
      expect(pollGap(c, resultOf(c), perfectPoll(c)).gap).toBe(0);
    }
  });

  it("המספרים המרכזיים (נבדקו בחישוב נפרד בפייתון)", () => {
    const s = cycles.map((c) => summarizeCycle(c, resultOf(c)));
    expect(s.map((x) => x.snapshot.length)).toEqual([14, 10, 10, 9, 9]);
    expect(s.map((x) => x.gap)).toEqual([37, 14, 7.5, 20, 14]);
    expect(s.map((x) => [x.bloc.estimate, x.bloc.actual])).toEqual([[54, 65], [55.5, 55], [56, 58], [50, 52], [60, 64]]);
    expect(s.map((x) => x.misses.map((m) => m.letters).sort())).toEqual([["ז", "נ"], ["כף"], [], [], ["מרצ"]]);
  });
});

describe("מכונים ומשפחות לאורך זמן", () => {
  it("כל מכון מופיע לכל היותר פעם אחת בכל מערכת", () => {
    for (const rec of pollsterRecords(cycles, results)) {
      const ids = rec.entries.map((e) => e.cycleId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("ש\"ס: בכל חמש המערכות קיבלה יותר מחציון הסקרים", () => {
    const rows = familyRows(cycles.map((c) => summarizeCycle(c, resultOf(c))));
    const shas = rows.find((r) => r.id === "shas")!;
    expect(shas.under).toBe(5);
    expect(shas.cells.map((x) => x.diff)).toEqual([-3, -2, -1, -1, -3]);
    const bloc = rows.find((r) => r.id === "bloc")!;
    expect(bloc.cells.map((x) => x.diff)).toEqual([-11, 0.5, -2, -2, -4]);
  });
});
