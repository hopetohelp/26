/**
 * השערות חריגות ממתינות לאישור מנהל (הכרעת בעלים 9.10.2026) — פונקציות טהורות.
 * השערת מפלגות חריגה אם יש בה מפלגה ש:
 *  א. קיבלה לפחות פי 1.5 מממוצע הגולשים האחרים, ולפחות 3.5 מנדטים יותר ממנו; או
 *  ב. היא אחת מהרשימות הנבחרות (WATCHED: הציבור החרדי, צבע שחור, נועם) והיא עוברת את אחוז החסימה (4 מנדטים ומעלה).
 *     (הכרעת בעלים 9.10.2026: במקום הכלל הקודם "עוברת את הסף כש-90% מהאחרים נתנו 0".)
 * "הגולשים האחרים" = הגרסה האחרונה של כל משתתף אחר שנספר בסטטיסטיקות (בלי "בבדיקה", בלי השערות שנדחו).
 * השערה שאושרה נכנסת; השערה שנדחתה לא נכנסת לעולם; גרסה חדשה נבדקת מחדש.
 */
import { LISTS_2026 } from "./lists.js";

export const RATIO = 1.5;
export const MIN_GAP = 3.5;
export const THRESHOLD_SEATS = 4;
/** רשימות שמעבר הסף שלהן ממתין תמיד לאישור מנהל */
export const WATCHED = ["haredi_public", "code_black", "noam"];

const seatValue = (payload, id) => payload?.seats?.[id]?.v ?? 0;

/** סכומים לכל מפלגה מתוך הגרסאות האחרונות: {sum, n} */
export function baseline(latestSeats) {
  const sum = {};
  for (const l of LISTS_2026) sum[l.id] = 0;
  for (const v of latestSeats) for (const l of LISTS_2026) sum[l.id] += seatValue(v.payload, l.id);
  return { sum, n: latestSeats.length };
}

/**
 * הסיבות שבגללן גרסה חריגה ([] = תקינה). self = הגרסה האחרונה של אותו משתתף שנכללה בבסיס (מופחתת ממנו), אם יש.
 * כל סיבה: {list, rule: 'ratio'|'watched', value, mean?}
 */
export function flagReasons(version, base, self = null) {
  const out = [];
  const n = base.n - (self ? 1 : 0);
  for (const l of LISTS_2026) {
    const x = seatValue(version.payload, l.id);
    if (!x) continue;
    if (WATCHED.includes(l.id) && x >= THRESHOLD_SEATS) out.push({ list: l.id, rule: "watched", value: x });
    if (n < 1) continue;
    const own = self ? seatValue(self.payload, l.id) : 0;
    const mean = (base.sum[l.id] - own) / n;
    if (x >= RATIO * mean && x - mean >= MIN_GAP) out.push({ list: l.id, rule: "ratio", value: x, mean: Math.round(mean * 100) / 100 });
  }
  return out;
}

/**
 * latestSeats: הגרסאות האחרונות (מנדטים) של המשתתפים שנספרים · decisions: Map(versionId ⇐ 'approved'|'rejected')
 * ⇐ { pending: Map(versionId ⇐ reasons), rejected: Set(versionId), isExcluded(version) } — לגרסאות ישנות (מגמה) נבדק מול אותו בסיס.
 */
export function moderate(latestSeats, decisions = new Map()) {
  const counted = latestSeats.filter((v) => decisions.get(v.id) !== "rejected");
  const base = baseline(counted);
  const latestOf = new Map(counted.map((v) => [v.participant, v]));
  const pending = new Map();
  const rejected = new Set();
  const check = (v) => {
    const d = decisions.get(v.id);
    if (d === "approved") return null;
    if (d === "rejected") return "rejected";
    const reasons = flagReasons(v, base, latestOf.get(v.participant) ?? null);
    return reasons.length ? reasons : null;
  };
  for (const v of latestSeats) {
    const r = check(v);
    if (r === "rejected") rejected.add(v.id);
    else if (r) pending.set(v.id, r);
  }
  const isExcluded = (v) => {
    if (v.unit !== "seats") return false;
    if (pending.has(v.id) || rejected.has(v.id)) return true;
    return check(v) !== null;
  };
  return { pending, rejected, isExcluded };
}
