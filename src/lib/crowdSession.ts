/**
 * הבעלים היחיד של מפתחות ההשתתפות ב-localStorage: אסימון הסשן (אחרי הרשמה או כניסה בשם משתתף וסיסמה),
 * הקישור האישי (רק כדי להציג אותו לשמירה), הטיוטות לכל יחידה, הגרסה האחרונה שנשמרה, ההסכמה וההקדמה.
 * טיוטות עובדות גם בלי חשבון — משחקים קודם, ונרשמים רק בלחיצה על "שמירה". כל גישה עטופה ב-try/catch — דפדפן חסום לאחסון עדיין עובד, רק בלי זיכרון.
 */
import type { Unit } from "./crowdApi";

const P = "elections26.crowd.";
const K = {
  token: P + "token",
  link: P + "link",
  linkAck: P + "linkAck",
  consent: P + "consent",
  intro: P + "intro",
  picture: P + "picture",
  draft: (u: Unit) => `${P}draft.${u}`,
  saved: (u: Unit) => `${P}saved.${u}`,
  pending: (u: Unit) => `${P}pending.${u}`,
};

const memory = new Map<string, string>();
const unavailable = new Set<string>();

function get(key: string): string | null {
  if (unavailable.has(key)) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function set(key: string, value: string | null): void {
  if (value === null) memory.delete(key); else memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    unavailable.delete(key);
  } catch {
    unavailable.add(key);
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

/**
 * הקישור האישי — מכניס ישר (דרך /auth/link, שמחזיר סשן) ומאפשר לקבוע סיסמה חדשה (אין מייל — הכרעת בעלים 6.10.2026).
 * נשמר כאן רק כדי להציג אותו לשמירה. הוא עצמו אינו אסימון הסשן.
 */
export const getLink = () => get(K.link);
export const setLink = (t: string | null) => set(K.link, t);
/** המשתתף אישר ששמר את הקישור — הכרטיס הבולט ב"שלי" מוסתר */
export const linkAcked = () => get(K.linkAck) === "1";
export const setLinkAck = (on: boolean) => set(K.linkAck, on ? "1" : null);

/** תמונת הפרופיל מ-Google — נשמרת רק בדפדפן הזה, לא בשרת (הכרעת בעלים 9.10.2026) */
export const getPicture = () => get(K.picture);
export const setPicture = (url: string | null) => set(K.picture, url && /^https:\/\/[\w.-]+\.googleusercontent\.com\//.test(url) ? url : null);

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
  set(K.link, null);
  set(K.linkAck, null);
  set(K.consent, null);
  set(K.picture, null);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("crowd-clear"));
}

/**
 * תור השליחה (שמירה מקומית קודם): גרסה שנשמרה בדפדפן אבל השרת עוד לא אישר שקיבל אותה —
 * ה-op_id הממתין זהה לגרסה השמורה. src/lib/outbox.ts שולח אותה שוב עד אישור.
 */
export function isQueued(u: Unit): boolean {
  const cur = getJson<{ op: string; body: string }>(K.pending(u));
  const saved = get(K.saved(u));
  return !!cur && saved !== null && cur.body === saved;
}
export const pendingOp = (u: Unit) => getJson<{ op: string; body: string }>(K.pending(u));
