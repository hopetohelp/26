/**
 * מנדטים ⇐ אחוזים (הכרעת בעלים 10.10.2026) — ליבה טהורה, בלי נתוני האתר: משותפת לאתר (src/lib/lawSeats.ts)
 * ולשרת המשתתפים (worker/crowd), כדי שכל השערה שמורה תכלול גם מנדטים וגם אחוזים לפי אותו חישוב בדיוק.
 */
import { allocate, type Agreement } from "./baderOfer";

export const THRESHOLD_PCT = 3.25;
/** אחוז לרשימה שקיבלה 0 מנדטים ובמקור הייתה מעל הסף: נשארת מתחת לסף, קרוב ככל האפשר */
export const BELOW_THRESHOLD_MAX = 3.2;
const r1 = (x: number) => Math.round(x * 10) / 10;

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

/**
 * אחוזים בעשירית שמחזירים לפי החוק בדיוק את המנדטים: רשימה עם 0 שומרת על האחוז שלה (ואם היה מעל הסף — יורד ל-3.2);
 * "אחרות" נשארות; רשימות ב-fixed (נעולות) שומרות על האחוז שלהן, והשאר מתוקנות בעשיריות. אין פתרון עם fixed ⇐ ניסיון בלעדיהן. אין פתרון ⇐ null.
 */
export function pctForSeats(
  ids: string[],
  seats: Record<string, number>,
  prev: Record<string, number>,
  { valid, agreements, others = 1.5, fixed = [] }: { valid: number; agreements: readonly Agreement[]; others?: number; fixed?: string[] },
): Record<string, number> | null {
  const target = Object.fromEntries(ids.map((id) => [id, seats[id] ?? 0]));
  if (ids.reduce((a, id) => a + target[id], 0) !== 120) return null;
  const keep = new Set(fixed.filter((id) => target[id] > 0 && (prev[id] ?? 0) >= THRESHOLD_PCT));
  const pct: Record<string, number> = {};
  const passing = ids.filter((id) => target[id] > 0);
  const free = passing.filter((id) => !keep.has(id));
  for (const id of ids) if (!target[id]) pct[id] = r1(Math.min(prev[id] ?? 0, BELOW_THRESHOLD_MAX));
  for (const id of keep) pct[id] = r1(prev[id]);
  const fixedSum = ids.reduce((a, id) => a + (target[id] && !keep.has(id) ? 0 : pct[id]), 0);
  const freeSeats = free.reduce((a, id) => a + target[id], 0);
  const keptSeats = 120 - freeSeats;
  // הרשימות הנעולות "תופסות" את החלק שלהן; השאר מתחלקות ביחס למנדטים
  const keptPct = [...keep].reduce((a, id) => a + pct[id], 0);
  const room = Math.max(free.length * THRESHOLD_PCT, 100 - (fixedSum - keptPct) - keptPct - Math.max(0, others));
  const perSeat = keptSeats && keptPct ? keptPct / keptSeats : room / Math.max(1, freeSeats);
  for (const id of free) pct[id] = Math.max(THRESHOLD_PCT + 0.05, r1(Math.min(perSeat * target[id], (target[id] / Math.max(1, freeSeats)) * room)));
  const over = ids.reduce((a, id) => a + pct[id], 0) - 100;
  if (over > 0.05) for (const id of [...free].sort((a, b) => target[b] - target[a])) { const cut = Math.min(over, pct[id] - THRESHOLD_PCT - 0.05); if (cut > 0) { pct[id] = r1(pct[id] - cut); break; } }
  for (let step = 0; step < 400 && free.length; step++) {
    const votes = sharesToVotes(ids, pct, valid);
    const r = allocate(votes, valid, agreements);
    if (r.status !== "ok") { const id = free[step % free.length]; pct[id] = r1(pct[id] + 0.1); continue; }
    if (passing.every((id) => (r.seats[id] ?? 0) === target[id]) && ids.every((id) => target[id] > 0 || !(r.seats[id] > 0))) return pct;
    const diff = free.map((id) => ({ id, d: (r.seats[id] ?? 0) - target[id] }));
    // רשימה נעולה שזזה ⇐ מתקנים דרך השאר: יותר מדי לנעולות = להגדיל פתוחה, פחות מדי = להקטין
    const keptDiff = [...keep].reduce((a, id) => a + (r.seats[id] ?? 0) - target[id], 0);
    const high = diff.filter((x) => x.d > 0).sort((a, b) => b.d - a.d)[0] ?? (keptDiff < 0 ? [...diff].sort((a, b) => target[b.id] - target[a.id])[0] : undefined);
    const low = diff.filter((x) => x.d < 0).sort((a, b) => a.d - b.d)[0] ?? (keptDiff > 0 ? [...diff].sort((a, b) => target[b.id] - target[a.id])[0] : undefined);
    if (high && pct[high.id] - 0.1 >= THRESHOLD_PCT + 0.05) pct[high.id] = r1(pct[high.id] - 0.1);
    if (low && ids.reduce((a, id) => a + pct[id], 0) + 0.1 <= 100.0001) pct[low.id] = r1(pct[low.id] + 0.1);
    else if (low && high) pct[high.id] = r1(pct[high.id] - 0.1);
  }
  return keep.size ? pctForSeats(ids, seats, prev, { valid, agreements, others }) : null;
}
