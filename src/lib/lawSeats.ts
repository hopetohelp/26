/**
 * מאחוזי הצבעה למנדטים — דרך מנוע החוק (src/engine/baderOfer.ts), בדיוק כמו מחשבון המנדטים:
 * אחוז מהקולות הכשרים ⇐ קולות ⇐ אחוז חסימה, הסכמי עודפים (meta.agreements2026) ובאדר-עופר.
 * המקור האחד להמרה הזו: המחשבון (src/pages/Calculator.tsx) וניחוש הגולשים לפי אחוזים (src/pages/guess/Seats.tsx).
 */
import { agreementsEffect, allocate, type Agreement, type AllocationResult } from "../engine/baderOfer";
import { meta, registry } from "./data";

/** ברירות המחדל של המחשבון: שיעור הצבעה 70%, פסולים 0.6% (כמו בבחירות האחרונות) */
export const DEFAULT_TURNOUT = 70;
export const INVALID_SHARE = 0.006;
export const THRESHOLD_PCT = 3.25;

export const validVotes = (eligible: number = registry.k26.eligible, turnout = DEFAULT_TURNOUT) => Math.round(eligible * (turnout / 100) * (1 - INVALID_SHARE));

export const sharesToVotes = (ids: string[], shares: Record<string, number>, valid: number) =>
  Object.fromEntries(ids.map((id) => [id, Math.round(((shares[id] || 0) / 100) * valid)]));

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
