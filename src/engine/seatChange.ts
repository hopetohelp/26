/**
 * השינוי הקרוב במנדטים של כל רשימה: כמה קולות חסרים לה למנדט נוסף, וכמה קולות עד שהיא מאבדת מנדט.
 * הכול דרך מנוע החוק (src/engine/baderOfer.ts): אחוז חסימה, מודד, שאריות באדר-עופר והסכמי עודפים — בלי חישוב משני.
 *
 * ההנחה: מוסיפים (או גורעים) קולות לרשימה אחת בלבד, והשאר קבועות. סך הקולות הכשרים משתנה בהתאם
 * (כמו `votesToNextSeat`). שינוי נחשב רק כשהחוק מכריע אותו: חלוקה שמחייבת הגרלה אינה נספרת כשינוי.
 */
import { allocate, type Agreement, type AllocationOptions } from "./baderOfer.ts";

export interface SeatShift {
  /** מספר הקולות הקטן ביותר (שלם) שמשנה את מספר המנדטים */
  votes: number;
  /** אותו מספר באחוזים מהקולות שיש לרשימה עכשיו (null לרשימה בלי קולות) */
  pct: number | null;
  /** מספר המנדטים אחרי השינוי (ייתכן שונה ביותר ממנדט אחד, למשל ירידה מתחת לאחוז החסימה) */
  toSeats: number;
}

export interface SeatChange {
  votes: number;
  seats: number;
  /** קולות שחסרים למנדט נוסף; null אם אין תשובה בתחום */
  up: SeatShift | null;
  /** קולות עד שהרשימה מאבדת מנדט; null לרשימה בלי מנדטים */
  down: SeatShift | null;
}

type Dir = 1 | -1;

/**
 * הקטן ביותר x ≥ 1 שבו מספר המנדטים של הרשימה גדול (dir=1) או קטן (dir=-1) מהקיים.
 * סריקה גסה בצעדים של חלקיק ממודד, ואז חיפוש בינארי בצעד האחרון בלבד — כך שאי-מונוטוניות קטנה של
 * הסכמי העודפים לא מפספסת שינוי מוקדם. null אם אין שינוי עד `cap`.
 */
function firstChange(
  votes: Record<string, number>, valid: number, list: string, agreements: readonly Agreement[],
  options: AllocationOptions | undefined, base: number, dir: Dir, cap: number, step: number,
): { x: number; toSeats: number } | null {
  const changed = (x: number) => {
    const v = { ...votes, [list]: votes[list] + dir * x };
    const r = allocate(v, valid + dir * x, agreements, options);
    if (r.status !== "ok") return null;
    const s = r.seats[list] ?? 0;
    return dir === 1 ? (s > base ? s : null) : (s < base ? s : null);
  };
  for (let x = Math.min(step, cap); ; x = Math.min(x + step, cap)) {
    const hit = changed(x);
    if (hit !== null) {
      let lo = Math.max(0, x - step);
      let hi = x;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (changed(mid) !== null) hi = mid; else lo = mid;
      }
      return { x: hi, toSeats: changed(hi) ?? hit };
    }
    if (x >= cap) return null;
  }
}

/** השינוי הקרוב לכל הרשימות שבקלט. קלט לא תקין לחוק (סכום מעל הכשרים וכו') ⇐ null */
export function seatChanges(
  votes: Record<string, number>, valid: number, agreements: readonly Agreement[] = [], options?: AllocationOptions,
): Record<string, SeatChange> | null {
  const base = allocate(votes, valid, agreements, options);
  if (base.status !== "ok") return null;
  const step = Math.max(1, Math.round(base.quota / 50));
  const out: Record<string, SeatChange> = {};
  for (const list of Object.keys(votes)) {
    const own = votes[list];
    const seats = base.seats[list] ?? 0;
    const shift = (hit: { x: number; toSeats: number } | null): SeatShift | null =>
      hit ? { votes: hit.x, pct: own > 0 ? (hit.x / own) * 100 : null, toSeats: hit.toSeats } : null;
    out[list] = {
      votes: own,
      seats,
      up: shift(firstChange(votes, valid, list, agreements, options, seats, 1, valid, step)),
      down: seats > 0 ? shift(firstChange(votes, valid, list, agreements, options, seats, -1, own, step)) : null,
    };
  }
  return out;
}
