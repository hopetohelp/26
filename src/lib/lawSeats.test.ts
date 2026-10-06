import { describe, expect, it } from "vitest";
import { allocate } from "../engine/baderOfer";
import { lists2026 } from "./data";
import { AGREEMENTS_2026, seatsFromPct, sharesToVotes, validVotes } from "./lawSeats";

const IDS = lists2026.map((l) => l.id);

describe("seatsFromPct — guess by vote percentages through the law engine", () => {
  const pct: Record<string, number> = Object.fromEntries(IDS.map((id) => [id, 0]));
  Object.assign(pct, { likud: 25, yashar: 20, together: 12, democrats: 9, shas: 8, utj: 7, otzma: 6, joint: 5, raam: 4, rzp: 2.5, yb: 1 });
  it("gives exactly what the engine gives the Calculator for the same input (120 seats)", () => {
    const law = seatsFromPct(IDS, pct)!;
    const valid = validVotes();
    const direct = allocate(sharesToVotes(IDS, pct, valid), valid, AGREEMENTS_2026);
    expect(law.r.status).toBe("ok");
    expect(law.r.seats).toEqual(direct.seats);
    expect(Object.values(law.r.seats).reduce((a, b) => a + b, 0)).toBe(120);
  });
  it("lists under 3.25% get no seats and are reported", () => {
    const law = seatsFromPct(IDS, pct)!;
    expect(law.under.sort()).toEqual(["rzp", "yb"]);
    expect(law.r.seats.rzp ?? 0).toBe(0);
    expect(law.r.passing).not.toContain("yb");
  });
  it("reports the surplus-agreement effect against no agreements", () => {
    const law = seatsFromPct(IDS, pct)!;
    const valid = validVotes();
    const none = allocate(sharesToVotes(IDS, pct, valid), valid, []);
    for (const id of IDS) expect((law.r.seats[id] ?? 0) - (none.seats[id] ?? 0)).toBe(law.effect[id] ?? 0);
  });
  it("over 100% ⇒ null", () => {
    expect(seatsFromPct(IDS, { ...pct, likud: 60 })).toBeNull();
  });
});
