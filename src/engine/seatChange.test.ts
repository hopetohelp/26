import { describe, expect, it } from "vitest";
import results from "../data/results.json";
import meta from "../data/meta.json";
import file2026 from "../../raw/results-2026.json";
import { allocate, votesToNextSeat, type Agreement } from "./baderOfer";
import { seatChanges } from "./seatChange";

const e22 = results.find((x) => x.knesset === 25)!;
const votes22 = Object.fromEntries(e22.lists.map((l) => [l.letters, l.votes]));
const ag22 = e22.agreements.map(([a, b]) => [a, b] as Agreement);
const ag26 = meta.agreements2026.map((a) => a.pair as unknown as Agreement);
const votes26 = (file2026 as { votes: Record<string, number> }).votes;
const valid26 = (file2026 as { valid: number }).valid;

/** מספר המנדטים כשהחוק מכריע; חלוקה שמחייבת הגרלה ⇐ null (לא נחשבת שינוי) */
const seatsAt = (votes: Record<string, number>, valid: number, ag: Agreement[], list: string, d: number) => {
  const r = allocate({ ...votes, [list]: votes[list] + d }, valid + d, ag);
  return r.status === "ok" ? r.seats[list] : null;
};

describe("השינוי הקרוב במנדטים", () => {
  for (const [name, votes, valid, ag] of [["2022", votes22, e22.valid, ag22], ["2026", votes26, valid26, ag26]] as const) {
    it(`${name}: בכל רשימה, ברף בדיוק המנדטים משתנים וקול אחד פחות אינו משנה`, () => {
      const ch = seatChanges(votes, valid, ag)!;
      expect(ch).not.toBeNull();
      for (const [list, c] of Object.entries(ch)) {
        expect(c.seats).toBe(allocate(votes, valid, ag).seats[list]);
        if (c.up) {
          expect(c.up.toSeats).toBeGreaterThan(c.seats);
          expect(seatsAt(votes, valid, ag, list, c.up.votes)).toBe(c.up.toSeats);
          expect(seatsAt(votes, valid, ag, list, c.up.votes - 1) ?? c.seats).toBeLessThanOrEqual(c.seats);
        }
        if (c.down) {
          expect(c.down.toSeats).toBeLessThan(c.seats);
          expect(seatsAt(votes, valid, ag, list, -c.down.votes)).toBe(c.down.toSeats);
          expect(seatsAt(votes, valid, ag, list, -(c.down.votes - 1)) ?? c.seats).toBeGreaterThanOrEqual(c.seats);
        }
        expect(c.seats > 0 ? c.down !== null : c.down === null).toBe(true);
      }
    });
  }

  it("2022: מסכים עם votesToNextSeat הקיים", () => {
    const ch = seatChanges(votes22, e22.valid, ag22)!;
    for (const list of ["אמת", "מחל", "פה"]) expect(ch[list].up!.votes).toBe(votesToNextSeat(votes22, e22.valid, list, ag22));
  });

  it("2022: רשימה שנפלה על הסף — הקולות הקרובים לשינוי מעבירים אותה את אחוז החסימה", () => {
    const failed = e22.lists.filter((l) => l.seats === 0).sort((a, b) => b.votes - a.votes)[0];
    const c = seatChanges(votes22, e22.valid, ag22)![failed.letters];
    expect(c.seats).toBe(0);
    expect(c.down).toBeNull();
    expect(c.up!.toSeats).toBeGreaterThanOrEqual(3);
    expect(c.up!.pct).toBeCloseTo((c.up!.votes / failed.votes) * 100, 10);
  });

  it("קלט שאינו חוקי ⇐ null", () => {
    expect(seatChanges({ a: 10 }, 5)).toBeNull();
  });
});
