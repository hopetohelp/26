/**
 * השערות חריגות ממתינות לאישור מנהל (הכרעת בעלים 9.10.2026) — פונקציות טהורות.
 * השערת מפלגות חריגה אם יש בה מפלגה ש:
 *  א. (הכרעת בעלים 12.10.2026, במקום "פי 1.5 מממוצע הגולשים") חורגת מטווח הסקרים בלפחות 50% ובלפחות 4.1 מנדטים, לשני הכיוונים:
 *     מעל — לפחות פי 1.5 מהקצה העליון; מתחת — לכל היותר חצי מהקצה התחתון. טווח הסקרים = הנמוך והגבוה בין המכונים,
 *     כמו באתר (public/poll-ranges.json, scripts/poll-ranges.mjs). רשימה שלא נסקרה = טווח 0–0.
 *  ב. היא אחת מהרשימות הנבחרות (WATCHED: הציבור החרדי, צבע שחור, נועם) והיא עוברת את אחוז החסימה (4 מנדטים ומעלה).
 * השערה שאושרה נכנסת; השערה שנדחתה לא נכנסת לעולם; גרסה חדשה נבדקת מחדש.
 * השערה שממתינה או שאושרה ונכנסה בהמשך לטווח (הטווח זז עם הסקרים) — חוזרת לבד להיות רגילה (הכרעת בעלים 12.10.2026).
 */
import { LISTS_2026, POLL_RANGES } from "./lists.js";

export const RATIO = 1.5;
export const MIN_GAP = 4.1;
export const THRESHOLD_SEATS = 4;
/** רשימות שמעבר הסף שלהן ממתין תמיד לאישור מנהל */
export const WATCHED = ["haredi_public", "code_black", "noam"];

const seatValue = (payload, id) => payload?.seats?.[id]?.v ?? 0;

/** טווח הסקרים הנוכחי: {id: {lo, hi}}. נטען מהאתר (setPollRanges); עד אז — הגיבוי שבקוד (lists.js) */
let RANGES = POLL_RANGES;
export function setPollRanges(ranges) {
  if (ranges && typeof ranges === "object") RANGES = ranges;
}
export const pollRange = (id) => RANGES[id] ?? { lo: 0, hi: 0 };

/** נשמר לתאימות: הבדיקה כבר אינה תלויה בשאר הגולשים */
export function baseline(latestSeats) {
  return { n: latestSeats.length };
}

/**
 * הסיבות שבגללן גרסה חריגה ([] = תקינה). כל סיבה: {list, rule: 'range'|'watched', value, lo?, hi?}
 */
export function flagReasons(version) {
  const out = [];
  for (const l of LISTS_2026) {
    const x = seatValue(version.payload, l.id);
    if (WATCHED.includes(l.id) && x >= THRESHOLD_SEATS) out.push({ list: l.id, rule: "watched", value: x });
    const { lo, hi } = pollRange(l.id);
    const above = x >= RATIO * hi && x - hi >= MIN_GAP;
    const below = x <= lo / 2 && lo - x >= MIN_GAP;
    if (above || below) out.push({ list: l.id, rule: "range", value: x, lo, hi });
  }
  return out;
}

/**
 * latestSeats: הגרסאות האחרונות (מנדטים) של המשתתפים שנספרים · decisions: Map(versionId ⇐ 'approved'|'rejected')
 * ⇐ { pending: Map(versionId ⇐ reasons), rejected: Set(versionId), isExcluded(version) } — לגרסאות ישנות (מגמה) נבדק מול אותו בסיס.
 */
export function moderate(latestSeats, decisions = new Map()) {
  const pending = new Map();
  const rejected = new Set();
  const check = (v) => {
    const d = decisions.get(v.id);
    if (d === "rejected") return "rejected";
    if (d === "approved") return null;
    const reasons = flagReasons(v);
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
