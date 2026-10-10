/**
 * מאחוזי הצבעה למנדטים — דרך מנוע החוק (src/engine/baderOfer.ts), בדיוק כמו מחשבון המנדטים:
 * אחוז מהקולות הכשרים ⇐ קולות ⇐ אחוז חסימה, הסכמי עודפים (meta.agreements2026) ובאדר-עופר.
 * המקור האחד להמרה הזו: מסך המנדטים בהשערה (src/pages/guess/Seats.tsx, מתג מנדטים | אחוזים) דרך src/pages/guess/pctSync.ts.
 */
import { agreementsEffect, allocate, type Agreement, type AllocationResult } from "../engine/baderOfer";
import { meta, registry } from "./data";

/** ברירות המחדל של המחשבון: שיעור הצבעה 70%, פסולים 0.6% (כמו בבחירות האחרונות) */
export const DEFAULT_TURNOUT = 70;
export const INVALID_SHARE = 0.006;
export const THRESHOLD_PCT = 3.25;

export const validVotes = (eligible: number = registry.k26.eligible, turnout = DEFAULT_TURNOUT) => Math.round(eligible * (turnout / 100) * (1 - INVALID_SHARE));

/**
 * אחוזים ⇐ קולות. אחוזים בדיוק של עשירית יוצרים שוויונות מלאכותיים (שתי רשימות באותו אחוז, או צירוף הסכם עודפים
 * ששווה בדיוק לרשימה אחרת) — ואז החוק מחייב הגרלה ואין תוצאה. במציאות זה לא קורה, ולכן כל רשימה מקבלת
 * פחות קולות לפי מקומה בסדר הרשימות (0, 1, 2… קולות) — הבדל זניח שמונע "הגרלה" על קלט מעוגל
 * (הכרעת בעלים 8.10.2026: החישוב חייב להחזיר תוצאה).
 */
export const sharesToVotes = (ids: string[], shares: Record<string, number>, valid: number) =>
  Object.fromEntries(ids.map((id, i) => {
    const v = Math.round(((shares[id] || 0) / 100) * valid);
    return [id, v > i ? v - i : v];
  }));

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

/** אחוז לרשימה שקיבלה 0 מנדטים ובמקור הייתה מעל הסף: נשארת מתחת לסף, קרוב ככל האפשר */
export const BELOW_THRESHOLD_MAX = 3.2;
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * מנדטים ⇐ אחוזים (הכרעת בעלים 10.10.2026, docs/מנדטים-אחוזים-ומה-השתנה-תוכנית.md):
 * רשימה עם 0 מנדטים שומרת על האחוז שלה (ואם היה מעל הסף — יורד ל-3.2); "אחרות" נשארות כמו שהיו;
 * לרשימות שעוברות — אחוז שמחזיר לפי החוק בדיוק את המנדטים שלהן (עשירית אחוז, לפחות 3.25).
 * מתחילים מחלוקה יחסית ומתקנים בצעדים של עשירית עד שהחוק מחזיר בדיוק את היעד. אין פתרון ⇐ null.
 */
export function pctForSeats(
  ids: string[],
  seats: Record<string, number>,
  prev: Record<string, number> = {},
  { valid = validVotes(), agreements = AGREEMENTS_2026, others = 1.5 }: { valid?: number; agreements?: Agreement[]; others?: number } = {},
): Record<string, number> | null {
  const target = Object.fromEntries(ids.map((id) => [id, seats[id] ?? 0]));
  if (ids.reduce((a, id) => a + target[id], 0) !== 120) return null;
  const pct: Record<string, number> = {};
  const passing = ids.filter((id) => target[id] > 0);
  for (const id of ids) if (!target[id]) pct[id] = r1(Math.min(prev[id] ?? 0, BELOW_THRESHOLD_MAX));
  const below = ids.reduce((a, id) => a + (target[id] ? 0 : pct[id]), 0);
  const room = Math.max(passing.length * THRESHOLD_PCT, 100 - below - Math.max(0, others));
  for (const id of passing) pct[id] = Math.max(THRESHOLD_PCT + 0.05, r1((target[id] / 120) * room));
  const over = ids.reduce((a, id) => a + pct[id], 0) - 100;
  if (over > 0.05) for (const id of [...passing].sort((a, b) => target[b] - target[a])) { const cut = Math.min(over, pct[id] - THRESHOLD_PCT - 0.05); if (cut > 0) { pct[id] = r1(pct[id] - cut); break; } }
  for (let step = 0; step < 400; step++) {
    const votes = sharesToVotes(ids, pct, valid);
    const r = allocate(votes, valid, agreements);
    if (r.status !== "ok") { const id = passing[step % passing.length]; pct[id] = r1(pct[id] + 0.1); continue; }
    const diff = passing.map((id) => ({ id, d: (r.seats[id] ?? 0) - target[id] }));
    if (diff.every((x) => x.d === 0) && ids.every((id) => target[id] > 0 || !(r.seats[id] > 0))) return pct;
    const high = diff.filter((x) => x.d > 0).sort((a, b) => b.d - a.d)[0];
    const low = diff.filter((x) => x.d < 0).sort((a, b) => a.d - b.d)[0];
    if (high && pct[high.id] - 0.1 >= THRESHOLD_PCT + 0.05) pct[high.id] = r1(pct[high.id] - 0.1);
    if (low && ids.reduce((a, id) => a + pct[id], 0) + 0.1 <= 100.0001) pct[low.id] = r1(pct[low.id] + 0.1);
    else if (low && high) pct[high.id] = r1(pct[high.id] - 0.1);
  }
  return null;
}
