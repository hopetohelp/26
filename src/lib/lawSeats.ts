/**
 * מאחוזי הצבעה למנדטים — דרך מנוע החוק (src/engine/baderOfer.ts), בדיוק כמו מחשבון המנדטים:
 * אחוז מהקולות הכשרים ⇐ קולות ⇐ אחוז חסימה, הסכמי עודפים (meta.agreements2026) ובאדר-עופר.
 * המקור האחד להמרה הזו: מסך המנדטים בהשערה (src/pages/guess/Seats.tsx, מתג מנדטים | אחוזים) דרך src/pages/guess/pctSync.ts.
 */
import { agreementsEffect, allocate, type Agreement, type AllocationResult } from "../engine/baderOfer";
import { pctForSeats as pctForSeatsCore, sharesToVotes, THRESHOLD_PCT } from "../engine/pctForSeats";
export { THRESHOLD_PCT };
import { meta, registry } from "./data";

/** ברירות המחדל של המחשבון: שיעור הצבעה 70%, פסולים 0.6% (כמו בבחירות האחרונות) */
export const DEFAULT_TURNOUT = 70;
export const INVALID_SHARE = 0.006;

export const validVotes = (eligible: number = registry.k26.eligible, turnout = DEFAULT_TURNOUT) => Math.round(eligible * (turnout / 100) * (1 - INVALID_SHARE));

export { sharesToVotes } from "../engine/pctForSeats";

/** כל הסכמי העודפים שדווחו ל-2026 (כולם פעילים — ברירת המחדל של המחשבון) */
export const AGREEMENTS_2026: Agreement[] = meta.agreements2026.map((a) => a.pair as unknown as Agreement);

export interface PctSeats {
  /** התוצאה לפי החוק עם הסכמי העודפים */
  r: AllocationResult;
  /** הפרש המנדטים שנובע מהסכמי העודפים (רק רשימות שזזו) */
  effect: Record<string, number>;
  /** רשימות שקיבלו קולות ולא עברו את אחוז החסימה */
  under: string[];
}

/** אחוזים ⇐ מנדטים לפי החוק. סכום מעל 100 ⇐ null */
export function seatsFromPct(ids: string[], pct: Record<string, number>, agreements: Agreement[] = AGREEMENTS_2026): PctSeats | null {
  const sum = ids.reduce((a, id) => a + (pct[id] || 0), 0);
  if (sum > 100.05) return null;
  const valid = validVotes();
  const votes = sharesToVotes(ids, pct, valid);
  const r = allocate(votes, valid, agreements);
  const effect = r.status === "ok" ? agreementsEffect(votes, valid, agreements) : {};
  const under = ids.filter((id) => votes[id] > 0 && !r.passing.includes(id));
  return { r, effect, under };
}

/**
 * מנדטים ⇐ אחוזים — הליבה ב-src/engine/pctForSeats.ts (משותפת לאתר ולשרת הגולשים); כאן עם ברירות המחדל של האתר.
 */
export function pctForSeats(
  ids: string[],
  seats: Record<string, number>,
  prev: Record<string, number> = {},
  { valid = validVotes(), agreements = AGREEMENTS_2026, others = 1.5, fixed = [] }: { valid?: number; agreements?: Agreement[]; others?: number; fixed?: string[] } = {},
): Record<string, number> | null {
  return pctForSeatsCore(ids, seats, prev, { valid, agreements, others, fixed });
}
