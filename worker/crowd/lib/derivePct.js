/**
 * אחוזים להשערת מנדטים שנשמרה בלי אחוזים (הכרעת בעלים 10.10.2026: לכל השערה שמורה — מנדטים וגם אחוזים).
 * אותה ליבה בדיוק כמו באתר (src/engine/pctForSeats.ts), עם אותן ברירות מחדל (src/pages/guess/pctSync.ts).
 */
import { pctForSeats } from "../../../src/engine/pctForSeats.ts";
import { DEFAULT_TURNOUT as TURNOUT, validVotesFor } from "../../../src/engine/law.ts";
import { AGREEMENTS, ELIGIBLE, LISTS_2026, POLL_SHARES } from "./lists.js";

const IDS = LISTS_2026.map((l) => l.id);
const OTHERS = Math.max(0, Math.round((100 - Object.values(POLL_SHARES).reduce((a, b) => a + b, 0)) * 10) / 10);

/** null ⇐ אין 120 מנדטים או שאין פתרון */
export function derivePct(payload) {
  if (!payload?.seats) return null;
  const c = payload.calculation;
  const valid = validVotesFor(c?.eligible ?? ELIGIBLE, c?.turnout ?? TURNOUT);
  const seats = Object.fromEntries(IDS.map((id) => [id, payload.seats[id]?.v ?? 0]));
  return pctForSeats(IDS, seats, POLL_SHARES, { valid, agreements: c?.agreements ?? AGREEMENTS, others: OTHERS });
}
