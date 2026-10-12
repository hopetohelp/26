/**
 * מאחוזי הצבעה למנדטים לפי החוק — ליבה טהורה, בלי נתוני האתר: משותפת לאתר (src/lib/lawSeats.ts), לשרת המשתתפים
 * (worker/crowd) ולשרת ה-MCP (worker/mcp), כדי שאין שני חישובים לאותה עובדה.
 * אחוז מהקולות הכשרים ⇐ קולות ⇐ אחוז חסימה, הסכמי עודפים ובאדר-עופר (src/engine/baderOfer.ts).
 */
import { agreementsEffect, allocate, type Agreement, type AllocationResult } from "./baderOfer.ts";
import { sharesToVotes } from "./pctForSeats.ts";

/** ברירות המחדל של המחשבון: שיעור הצבעה 70%, פסולים 0.6% (כמו בבחירות האחרונות) */
export const DEFAULT_TURNOUT = 70;
export const INVALID_SHARE = 0.006;

/** קולות כשרים: בעלי זכות בחירה × שיעור ההצבעה × (1 − פסולים) */
export const validVotesFor = (eligible: number, turnout = DEFAULT_TURNOUT) => Math.round(eligible * (turnout / 100) * (1 - INVALID_SHARE));

export interface PctSeats {
  /** התוצאה לפי החוק עם הסכמי העודפים */
  r: AllocationResult;
  /** הפרש המנדטים שנובע מהסכמי העודפים (רק רשימות שזזו) */
  effect: Record<string, number>;
  /** רשימות שקיבלו קולות ולא עברו את אחוז החסימה */
  under: string[];
}

/** אחוזים ⇐ מנדטים לפי החוק. סכום מעל 100 ⇐ null */
export function seatsFromShares(ids: string[], pct: Record<string, number>, { valid, agreements }: { valid: number; agreements: readonly Agreement[] }): PctSeats | null {
  const sum = ids.reduce((a, id) => a + (pct[id] || 0), 0);
  if (sum > 100.05) return null;
  const votes = sharesToVotes(ids, pct, valid);
  const r = allocate(votes, valid, agreements);
  const effect = r.status === "ok" ? agreementsEffect(votes, valid, agreements) : {};
  const under = ids.filter((id) => votes[id] > 0 && !r.passing.includes(id));
  return { r, effect, under };
}
