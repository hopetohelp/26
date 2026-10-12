/**
 * מאחוזי הצבעה למנדטים — דרך מנוע החוק (src/engine/baderOfer.ts), בדיוק כמו מחשבון המנדטים:
 * אחוז מהקולות הכשרים ⇐ קולות ⇐ אחוז חסימה, הסכמי עודפים (meta.agreements2026) ובאדר-עופר.
 * המקור האחד להמרה הזו: מסך המנדטים בהשערה (src/pages/guess/Seats.tsx, מתג מנדטים | אחוזים) דרך src/pages/guess/pctSync.ts.
 */
import type { Agreement } from "../engine/baderOfer";
import { pctForSeats as pctForSeatsCore, THRESHOLD_PCT } from "../engine/pctForSeats";
import { DEFAULT_TURNOUT, INVALID_SHARE, seatsFromShares, validVotesFor, type PctSeats } from "../engine/law";
export { THRESHOLD_PCT, DEFAULT_TURNOUT, INVALID_SHARE, type PctSeats };
import { meta, registry } from "./data";

/** הליבה ב-src/engine/law.ts; כאן עם בעלי זכות הבחירה של 2026 כברירת מחדל */
export const validVotes = (eligible: number = registry.k26.eligible, turnout = DEFAULT_TURNOUT) => validVotesFor(eligible, turnout);

export { sharesToVotes } from "../engine/pctForSeats";

/** כל הסכמי העודפים שדווחו ל-2026 (כולם פעילים — ברירת המחדל של המחשבון) */
export const AGREEMENTS_2026: Agreement[] = meta.agreements2026.map((a) => a.pair as unknown as Agreement);

/** אחוזים ⇐ מנדטים לפי החוק (הליבה ב-src/engine/law.ts). סכום מעל 100 ⇐ null */
export function seatsFromPct(ids: string[], pct: Record<string, number>, agreements: Agreement[] = AGREEMENTS_2026): PctSeats | null {
  return seatsFromShares(ids, pct, { valid: validVotes(), agreements });
}

/**
 * מנדטים ⇐ אחוזים — הליבה ב-src/engine/pctForSeats.ts (משותפת לאתר ולשרת המשתתפים); כאן עם ברירות המחדל של האתר.
 */
export function pctForSeats(
  ids: string[],
  seats: Record<string, number>,
  prev: Record<string, number> = {},
  { valid = validVotes(), agreements = AGREEMENTS_2026, others = 1.5, fixed = [] }: { valid?: number; agreements?: Agreement[]; others?: number; fixed?: string[] } = {},
): Record<string, number> | null {
  return pctForSeatsCore(ids, seats, prev, { valid, agreements, others, fixed });
}
