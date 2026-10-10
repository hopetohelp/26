import { describe, expect, it } from "vitest";
import { pctOf, seatsOfPct, withPct, withSeats, DEFAULT_CALC } from "./pctSync";
import { IDS, POLLS, startSeats } from "./model";

const values = (p: { seats: Record<string, { v: number }> }) => Object.fromEntries(IDS.map((id) => [id, p.seats[id]?.v ?? 0]));

describe("סנכרון מנדטים ואחוזים בהשערה", () => {
  it("השערה לפי מנדטים מקבלת אחוזים שמחזירים בדיוק את אותם מנדטים", () => {
    const p = startSeats("polls");
    const seats = { ...p.seats, likud: { ...p.seats.likud, v: p.seats.likud.v + 1 }, yashar: { ...p.seats.yashar, v: p.seats.yashar.v - 1 } };
    const next = withSeats(p, seats);
    expect(next.mode).toBe("seats");
    const back = seatsOfPct(next.pct!, DEFAULT_CALC);
    expect("seats" in back && back.seats).toEqual(values(next));
  });

  it("עריכת אחוז: המנדטים לפי החוק, והמפלגה שהוקלדה ננעלת", () => {
    const p = withSeats(startSeats("polls"), startSeats("polls").seats);
    const r = withPct(p, { ...p.pct!, likud: (p.pct!.likud ?? 0) + 2, yashar: (p.pct!.yashar ?? 0) - 2 }, { touched: "likud" });
    expect(r.error).toBeNull();
    expect(r.payload.mode).toBe("pct");
    expect(r.payload.seats.likud.locked).toBe(true);
    expect(r.payload.seats.likud.v).toBeGreaterThan(POLLS.likud);
    expect(Object.values(r.payload.seats).reduce((a, c) => a + c.v, 0)).toBe(120);
  });

  it("סכום מעל 100: האחוזים נשמרים, המנדטים לא זזים, יש הסבר — והמפלגה שהוקלדה ננעלת", () => {
    const p = withSeats(startSeats("polls"), startSeats("polls").seats);
    const r = withPct(p, { ...p.pct!, together: 40 }, { touched: "together" });
    expect(r.error).toMatch(/יותר מ-100%/);
    expect(values(r.payload)).toEqual(values(p));
    expect(r.payload.seats.together.locked).toBe(true);
  });

  it("השערה ישנה בלי אחוזים — האחוזים מחושבים מהמנדטים", () => {
    const pct = pctOf(startSeats("polls"))!;
    const back = seatsOfPct(pct, DEFAULT_CALC);
    expect("seats" in back && back.seats).toEqual(values(startSeats("polls")));
    expect(Object.values(pctOf(startSeats("zero"))!).every((x) => x === 0)).toBe(true);
  });
});
