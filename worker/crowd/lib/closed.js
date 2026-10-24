/**
 * רשימות שלא עברו את אחוז החסימה באף סקר (הכרעת בעלים 24.10.2026): אי אפשר לשמור עליהן מנדטים, ומהשערות שנשמרו לפני ההחלטה
 * הן נמחקות בכל קריאה מהמאגר. שאר ההשערה ממשיכה להיספר; בכניסה הבאה הגולש מחלק מחדש את המנדטים שהתפנו.
 */
import { CLOSED_LISTS } from "./lists.js";

/** הרשימה העדכנית נטענת מהאתר עם טווח הסקרים (poll-ranges.json ⇐ setClosedLists); עד אז — הגיבוי שבקוד */
export const CLOSED = new Set(CLOSED_LISTS);
export function setClosedLists(ids) {
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) return;
  CLOSED.clear();
  for (const id of ids) CLOSED.add(id);
}

/** payload של גרסה כפי שנקרא מהמאגר ⇐ בלי רשימות סגורות (רק ביחידת מנדטים) */
export function withoutClosed(unit, payload) {
  if (unit !== "seats" || !payload?.seats || !Object.keys(payload.seats).some((id) => CLOSED.has(id))) return payload;
  const strip = (o) => o && Object.fromEntries(Object.entries(o).filter(([id]) => !CLOSED.has(id)));
  return { ...payload, seats: strip(payload.seats), ...(payload.pct ? { pct: strip(payload.pct) } : {}) };
}

/** שורת גרסה מהמאגר (payload כטקסט) ⇐ payload מפוענח ונקי */
export const readPayload = (r) => withoutClosed(r.unit ?? "seats", JSON.parse(r.payload));
