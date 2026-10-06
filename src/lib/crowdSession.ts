/**
 * הבעלים היחיד של מפתחות ההשתתפות ב-localStorage: האסימון (הקישור האישי), הטיוטות לכל יחידה,
 * הגרסה האחרונה שנשמרה, ההסכמה וההקדמה. כל גישה עטופה ב-try/catch — דפדפן חסום לאחסון עדיין עובד, רק בלי זיכרון.
 */
import type { Unit } from "./crowdApi";

const P = "elections26.crowd.";
const K = {
  token: P + "token",
  consent: P + "consent",
  intro: P + "intro",
  draft: (u: Unit) => `${P}draft.${u}`,
  saved: (u: Unit) => `${P}saved.${u}`,
  pending: (u: Unit) => `${P}pending.${u}`,
};

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* לא נשמר — רק לביקור הזה */
  }
}
function getJson<T>(key: string): T | null {
  const raw = get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const getToken = () => get(K.token);
export const setToken = (t: string | null) => set(K.token, t);

export const hasConsent = () => get(K.consent) === "1";
export const setConsent = (on: boolean) => set(K.consent, on ? "1" : null);

export const introSeen = () => get(K.intro) === "1";
export const markIntroSeen = () => set(K.intro, "1");

export const loadDraft = <T>(u: Unit) => getJson<T>(K.draft(u));
export const saveDraft = <T>(u: Unit, payload: T) => set(K.draft(u), JSON.stringify(payload));
export const clearDraft = (u: Unit) => set(K.draft(u), null);

/** מה שנשמר בשרת לאחרונה — כדי להבחין בין "נשמר" ל"שינויים שלא נשמרו" */
export const loadSaved = <T>(u: Unit) => getJson<T>(K.saved(u));
export const setSaved = <T>(u: Unit, payload: T | null) => set(K.saved(u), payload === null ? null : JSON.stringify(payload));

/**
 * op_id של שמירה שעוד לא אושרה. ניסיון חוזר לאותו תוכן משתמש באותו op_id (השרת לא יוצר כפילות);
 * תוכן אחר ⇐ op_id חדש.
 */
export function opIdFor(u: Unit, payload: unknown): string {
  const body = JSON.stringify(payload);
  const cur = getJson<{ op: string; body: string }>(K.pending(u));
  if (cur && cur.body === body) return cur.op;
  const op = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  set(K.pending(u), JSON.stringify({ op, body }));
  return op;
}
export const clearPending = (u: Unit) => set(K.pending(u), null);

/** מחיקה מקומית מלאה (אחרי מחיקה בשרת או יציאה) */
export function clearAll(): void {
  for (const u of ["vote", "seats", "blocs"] as Unit[]) {
    set(K.draft(u), null);
    set(K.saved(u), null);
    set(K.pending(u), null);
  }
  set(K.token, null);
  set(K.consent, null);
}
