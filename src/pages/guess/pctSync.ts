/**
 * סנכרון מנדטים ⇐⇒ אחוזים בהשערה (הכרעת בעלים 10.10.2026, docs/מנדטים-אחוזים-ומה-השתנה-תוכנית.md).
 * מקור אחד: אחוזים ⇐ מנדטים לפי חוק הבחירות (lawSeats), ומנדטים ⇐ אחוזים ב-pctForSeats (הלוך-חזור מחזיר אותם מנדטים).
 * mode אומר מה המשתתף הקליד לאחרונה; האחוזים נשמרים בשני המצבים.
 */
import { allocate, type Agreement } from "../../engine/baderOfer";
import type { SeatCell, SeatsPayload } from "../../lib/crowdApi";
import { registry } from "../../lib/data";
import { AGREEMENTS_2026, DEFAULT_TURNOUT, pctForSeats, sharesToVotes, validVotes } from "../../lib/lawSeats";
import { IDS, POLL_SHARES } from "./model";

export type Calc = NonNullable<SeatsPayload["calculation"]>;
export const DEFAULT_CALC: Calc = { turnout: DEFAULT_TURNOUT, eligible: registry.k26.eligible, agreements: AGREEMENTS_2026.map((p) => [...p]) };
export const calcOf = (p: SeatsPayload | null): Calc => p?.calculation ?? DEFAULT_CALC;
const law = (c: Calc) => ({ valid: validVotes(c.eligible, c.turnout), agreements: c.agreements as unknown as Agreement[] });
const sumOf = (x: Record<string, number>) => IDS.reduce((a, id) => a + (x[id] || 0), 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** "אחרות" (קולות לרשימות שאינן ברשימה) — כמו שהיה, ובלי אחוזים קודמים — כמו בממוצע הסקרים */
const othersOf = (prev?: Record<string, number>) => Math.max(0, r1(100 - sumOf(prev ?? POLL_SHARES)));

/** מנדטים ⇐ אחוזים לכל השערה של 120 מנדטים; אחוזים שנשמרו גוברים */
export function pctOf(p: SeatsPayload): Record<string, number> | null {
  if (p.pct) return p.pct;
  const seats = Object.fromEntries(IDS.map((id) => [id, p.seats[id]?.v ?? 0]));
  const total = sumOf(seats);
  if (total === 120) {
    const exact = pctForSeats(IDS, seats, POLL_SHARES, { ...law(calcOf(p)), others: othersOf() });
    if (exact) return exact;
  }
  return approxPct(seats, total);
}

/**
 * חלוקה שעוד לא הגיעה ל-120: אחוזים בקירוב, כדי שאפשר יהיה להמשיך באחוזים —
 * רשימה עם מנדטים מקבלת חלק יחסי, רשימה עם 0 — את ממוצע הסקרים שלה, עד 3.2. בלי מנדטים בכלל ⇐ אפסים.
 */
function approxPct(seats: Record<string, number>, total: number): Record<string, number> {
  if (!total) return Object.fromEntries(IDS.map((id) => [id, 0]));
  const below = Object.fromEntries(IDS.filter((id) => !seats[id]).map((id) => [id, r1(Math.min(POLL_SHARES[id] ?? 0, 3.2))]));
  const room = 100 - othersOf() - IDS.reduce((a, id) => a + (below[id] ?? 0), 0);
  return Object.fromEntries(IDS.map((id) => [id, seats[id] ? Math.floor((seats[id] / 120) * room * 10) / 10 : below[id]]));
}

/** עריכה במנדטים: האחוזים מחושבים מחדש מהמנדטים (רשימה עם 0 שומרת על האחוז שלה) */
export function withSeats(p: SeatsPayload, seats: Record<string, SeatCell>, extra: Partial<SeatsPayload> = {}, mode: "seats" | "pct" = "seats"): SeatsPayload {
  const values = Object.fromEntries(IDS.map((id) => [id, seats[id]?.v ?? 0]));
  const c = calcOf(p);
  const prev = p.pct ?? POLL_SHARES;
  // רשימה נעולה שומרת על האחוז שלה (כשיש לה כבר אחוז), גם אחרי "השלם הכול"
  const fixed = p.pct ? IDS.filter((id) => seats[id]?.locked) : [];
  const pct = sumOf(values) === 120 ? pctForSeats(IDS, values, prev, { ...law(c), others: othersOf(p.pct), fixed }) : null;
  const { pct: _old, ...rest } = p;
  return { ...rest, ...extra, mode: pct ? mode : "seats", seats, ...(pct ? { pct } : {}) };
}

/** אחוזים ⇐ מנדטים לפי החוק; בעיה ⇐ הסבר */
export function seatsOfPct(pct: Record<string, number>, c: Calc): { seats: Record<string, number> } | { error: string } {
  const s = sumOf(pct);
  if (s > 100.05) return { error: `סכום האחוזים ${r1(s)}%, יותר מ-100%. הקטינו אחת המפלגות.` };
  const { valid, agreements } = law(c);
  const r = allocate(sharesToVotes(IDS, pct, valid), valid, agreements);
  if (r.status === "lottery_required") return { error: "שוויון מדויק בין מפלגות — לפי החוק מכריעה הגרלה. שנו אחד האחוזים בעשירית." };
  if (r.status !== "ok") return { error: r.error ?? "אי אפשר לחשב מנדטים מהאחוזים האלה." };
  return { seats: Object.fromEntries(IDS.map((id) => [id, r.seats[id] ?? 0])) };
}

/**
 * עריכה באחוזים: המנדטים מחושבים לפי החוק. הנעילות נשמרות; רשימה שהוקלדה — ננעלת.
 * חישוב שנכשל (סכום מעל 100) ⇐ האחוזים נשמרים בטיוטה, המנדטים נשארים כמו שהיו, והשגיאה מוצגת.
 */
export function withPct(p: SeatsPayload, pct: Record<string, number>, opts: { touched?: string; calc?: Calc; extra?: Partial<SeatsPayload> } = {}): { payload: SeatsPayload; error: string | null } {
  const c = opts.calc ?? calcOf(p);
  const r = seatsOfPct(pct, c);
  const seats = "seats" in r
    ? Object.fromEntries(IDS.map((id) => {
        const old = p.seats[id] ?? { v: 0, src: "manual" as const, locked: false };
        return [id, id === opts.touched ? { v: r.seats[id], src: "manual" as const, locked: true } : { ...old, v: r.seats[id] }];
      }))
    : opts.touched ? { ...p.seats, [opts.touched]: { ...(p.seats[opts.touched] ?? { v: 0 }), src: "manual" as const, locked: true } } : p.seats;
  return { payload: { ...p, ...opts.extra, mode: "pct", pct, calculation: c, seats }, error: "error" in r ? r.error : null };
}
