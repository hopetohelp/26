import { describe, expect, it } from "vitest";
import { allocate } from "../engine/baderOfer";
import { AGREEMENTS_2026, pctForSeats, sharesToVotes, THRESHOLD_PCT, validVotes } from "./lawSeats";
import { lists2026 } from "./data";
import modelFile from "../data/model.json";

const ids = lists2026.map((l) => l.id);
const polls = (modelFile as unknown as { central: { seats: Record<string, number>; shares: Record<string, number> } }).central;
const back = (pct: Record<string, number>) => allocate(sharesToVotes(ids, pct, validVotes()), validVotes(), AGREEMENTS_2026).seats;

/** חלוקה אקראית תקינה: 120 מנדטים, כל רשימה 0 או לפחות 4 */
function randomSeats(seed: number): Record<string, number> {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const on = ids.filter(() => rnd() < 0.6).slice(0, 12);
  if (on.length < 2) on.push(...ids.slice(0, 2));
  const out: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  on.forEach((id) => (out[id] = 4));
  for (let left = 120 - on.length * 4; left > 0; left--) out[on[Math.floor(rnd() * on.length)]]++;
  return out;
}

describe("מנדטים ⇐ אחוזים ⇐ מנדטים (הלוך-חזור)", () => {
  it("ממוצע הסקרים חוזר בדיוק", () => {
    const pct = pctForSeats(ids, polls.seats, polls.shares)!;
    expect(pct).not.toBeNull();
    for (const id of ids) expect(back(pct)[id] ?? 0).toBe(polls.seats[id] ?? 0);
  });

  it("200 חלוקות אקראיות חוזרות בדיוק, באחוזים של עשירית ובסכום עד 100", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const seats = randomSeats(seed);
      const pct = pctForSeats(ids, seats, polls.shares)!;
      expect(pct, `seed ${seed}`).not.toBeNull();
      const r = back(pct);
      for (const id of ids) expect(r[id] ?? 0, `seed ${seed} ${id}`).toBe(seats[id]);
      expect(ids.reduce((a, id) => a + pct[id], 0)).toBeLessThanOrEqual(100.05);
      for (const id of ids) expect(Math.abs(pct[id] * 10 - Math.round(pct[id] * 10))).toBeLessThan(1e-6);
    }
  });

  it("רשימה עם 0 שומרת על האחוז שלה מתחת לסף", () => {
    const seats = { ...polls.seats };
    const pct = pctForSeats(ids, seats, { ...polls.shares, bluewhite: 2.4 })!;
    expect(pct.bluewhite).toBe(2.4);
    for (const id of ids) if (!seats[id]) expect(pct[id]).toBeLessThan(THRESHOLD_PCT);
  });

  it("סכום שאינו 120 ⇐ null", () => {
    expect(pctForSeats(ids, { likud: 60 })).toBeNull();
  });
});
