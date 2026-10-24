/**
 * השערות חריגות ממתינות לאישור מנהל — פונקציות טהורות.
 * הכלל (הכרעת בעלים 24.10.2026, במקום כלל "פי 1.5 מטווח הסקרים" והרשימות הנבחרות; חל גם רטרואקטיבית):
 * השערה ממתינה אם יש בה רשימה ש**גם** רחוקה לפחות 75% מממוצע המשתתפים (פי 1.75 ומעלה, או רבע ומטה)
 * **וגם** נמצאת לפחות 5 מנדטים מחוץ לטווח הסקרים (מעל הגבוה או מתחת לנמוך; רשימה שלא נסקרה = טווח 0–0).
 * ממוצע המשתתפים = ממוצע ההשערות האחרונות של כל שאר המשתתפים שנספרים (בלי ההשערה הנבדקת עצמה, כדי שהשערה קיצונית לא תזיז
 * את הממוצע שמולו היא נבדקת), כולל הממתינות.
 * השערה שאושרה נכנסת; השערה שנדחתה לא נכנסת לעולם; גרסה חדשה נבדקת מחדש.
 */
import { LISTS_2026, POLL_RANGES } from "./lists.js";

/** כמה רחוק מממוצע המשתתפים (חלק מהממוצע) */
export const CROWD_FAR = 0.75;
/** כמה מנדטים מחוץ לטווח הסקרים */
export const OUTSIDE_SEATS = 5;

const seatValue = (payload, id) => payload?.seats?.[id]?.v ?? 0;

/** סכומי המשתתפים לכל רשימה ומספרם — נקבעים בכל הרצה של moderate; לפני כן (למשל בשמירה בתהליך חדש) ריק ⇐ רק כלל הטווח */
let BASE = { sums: {}, n: 0 };
const baseOf = (versions) => ({ n: versions.length, sums: Object.fromEntries(LISTS_2026.map((l) => [l.id, versions.reduce((a, v) => a + seatValue(v.payload, l.id), 0)])) });
/** ממוצע שאר המשתתפים. own = ההשערה הנבדקת נכללת בסכומים (ואז מוצאת מהם) */
function meansWithout(base, payload, own) {
  const n = base.n - (own ? 1 : 0);
  if (n < 1) return {};
  return Object.fromEntries(LISTS_2026.map((l) => [l.id, (base.sums[l.id] - (own ? seatValue(payload, l.id) : 0)) / n]));
}

/** טווח הסקרים הנוכחי: {id: {lo, hi}}. נטען מהאתר (setPollRanges); עד אז — הגיבוי שבקוד (lists.js) */
let RANGES = POLL_RANGES;
export function setPollRanges(ranges) {
  if (ranges && typeof ranges === "object") RANGES = ranges;
}
export const pollRange = (id) => RANGES[id] ?? { lo: 0, hi: 0 };

/**
 * הסיבות שבגללן גרסה חריגה ([] = תקינה). כל סיבה: {list, rule: 'range', value, lo, hi, mean}
 */
export function flagReasons(version, means = meansWithout(BASE, version?.payload, false)) {
  const out = [];
  for (const l of LISTS_2026) {
    const x = seatValue(version.payload, l.id);
    const { lo, hi } = pollRange(l.id);
    const outside = Math.max(0, x - hi, lo - x);
    const m = means[l.id];
    const far = m === undefined || Math.abs(x - m) >= CROWD_FAR * m;
    if (outside >= OUTSIDE_SEATS && far) out.push({ list: l.id, rule: "range", value: x, lo, hi, ...(m === undefined ? {} : { mean: Math.round(m * 10) / 10 }) });
  }
  return out;
}

/**
 * latestSeats: הגרסאות האחרונות (מנדטים) של המשתתפים שנספרים · decisions: Map(versionId ⇐ 'approved'|'rejected')
 * ⇐ { pending: Map(versionId ⇐ reasons), rejected: Set(versionId), isExcluded(version) } — לגרסאות ישנות (מגמה) נבדק מול אותו בסיס.
 */
export function moderate(latestSeats, decisions = new Map()) {
  BASE = baseOf(latestSeats);
  const base = BASE, inBase = new Set(latestSeats);
  const pending = new Map();
  const rejected = new Set();
  const check = (v) => {
    const d = decisions.get(v.id);
    if (d === "rejected") return "rejected";
    if (d === "approved") return null;
    const reasons = flagReasons(v, meansWithout(base, v.payload, inBase.has(v)));
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
