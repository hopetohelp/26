/**
 * הצ'אט החכם עם מפתח AI אישי. הבעלים היחיד של המפתח האישי ושל הקריאות ל-`/private/*`.
 *
 * 🔴 הכרעת בעלים 18.10.2026: המשתמש בוחר היכן נשמר המפתח —
 *  - בחשבון: מוצפן בשרת, אינו חוזר לדפדפן לעולם, וזמין מכל מכשיר (דורש כניסה).
 *  - במכשיר הזה בלבד: ב-localStorage, ונשלח עם כל שאלה (גם בלי חשבון).
 * לחשבון מחובר השיחה נשמרת בשרת מוצפנת ומוחזרת רק לו; בלי חשבון היא בזיכרון הדף בלבד. נפרדת לגמרי מהשיחה עם צוות האתר.
 */
import { useEffect, useSyncExternalStore } from "react";
import { FEEDBACK_URL } from "./feedback";
import { getToken } from "./crowdSession";

/** המפתח במכשיר בלבד (sessionStorage — שמירה ישנה עד סגירת הלשונית) */
const DEVICE = "elections26.privateKey";

export interface PrivateTurn { role: "user" | "assistant"; text: string }
export type PrivateError = "bad_key" | "quota" | "rate" | "unavailable" | "offline" | "no_key" | "unauthorized";
export type KeyPlace = "account" | "device";

/** צורת מפתח סבירה: בלי רווחים, באורך שהשרת מקבל */
export const isPlausibleKey = (k: string) => k.length >= 20 && k.length <= 400 && !/\s/.test(k);

/** האם לחשבון המחובר יש מפתח שמור בשרת (null = לא ידוע / לא מחוברים) */
let state: { token: string | null; has: boolean | null; device: string | null } = { token: null, has: null, device: null };
const listeners = new Set<() => void>();
const emit = (next: Partial<typeof state>) => { state = { ...state, ...next }; listeners.forEach((l) => l()); };

function readDevice(): string | null {
  for (const store of [() => localStorage, () => sessionStorage]) {
    try { const v = store().getItem(DEVICE); if (v && isPlausibleKey(v)) return v; } catch { /* אחסון חסום */ }
  }
  return null;
}
function writeDevice(key: string | null): boolean {
  for (const store of [() => localStorage, () => sessionStorage]) { try { store().removeItem(DEVICE); } catch { /* אחסון חסום */ } }
  if (key) try { localStorage.setItem(DEVICE, key); } catch { return false; }
  emit({ device: key });
  return true;
}

async function call(path: string, body: object): Promise<{ ok?: boolean; has?: boolean; error?: string; text?: string; turns?: PrivateTurn[] }> {
  if (!FEEDBACK_URL) return { ok: false, error: "offline" };
  try {
    const res = await fetch(`${FEEDBACK_URL}/private/${path}`, {
      method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return await res.json().catch(() => ({}));
  } catch { return { ok: false, error: "offline" }; }
}

/** בודק מול השרת אם לחשבון יש מפתח שמור */
export async function refreshPrivateKey(token = getToken()) {
  const device = readDevice();
  if (!token) return emit({ token: null, has: null, device });
  const r = await call("key", { token });
  if (getToken() === token) emit({ token, has: r.ok ? !!r.has : null, device });
}

/** שומר את המפתח בחשבון (בשרת) או במכשיר הזה בלבד. מחזיר שגיאה, או null בהצלחה */
export async function savePrivateKey(key: string, place: KeyPlace = "account"): Promise<string | null> {
  const k = key.trim();
  if (place === "device") return writeDevice(k) ? null : "הדפדפן חוסם שמירה, ולכן אי אפשר לשמור את המפתח במכשיר.";
  const token = getToken();
  if (!token) return "כדי לשמור מפתח בחשבון צריך להיכנס לחשבון.";
  const r = await call("key", { token, key: k });
  if (!r.ok) return r.error === "bad_key" ? "המפתח לא נראה תקין. בדקו שהועתק במלואו, בלי רווחים." : "לא הצלחנו לשמור את המפתח כרגע. נסו שוב בעוד רגע.";
  writeDevice(null);
  emit({ token, has: !!r.has });
  return null;
}

/** מסיר את המפתח מהמכשיר ומהחשבון */
export async function removePrivateKey() {
  writeDevice(null);
  const token = getToken();
  if (!token) return;
  const r = await call("key", { token, key: null });
  emit({ token, has: r.ok ? !!r.has : state.has });
}

/** היכן המפתח האישי הזמין כעת: במכשיר, בחשבון, או null */
export function usePrivateKey(): KeyPlace | null {
  const token = getToken();
  const snap = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
  useEffect(() => { if (snap.token !== token || snap.device !== readDevice()) void refreshPrivateKey(token); }, [token, snap.token, snap.device]);
  if (snap.device) return "device";
  return snap.token === token && !!token && snap.has === true ? "account" : null;
}

/** השיחה השמורה בחשבון (מוצפנת בשרת). בלי חשבון — ריקה */
export async function loadPrivateHistory(): Promise<PrivateTurn[]> {
  const token = getToken();
  if (!token) return [];
  const r = await call("history", { token });
  return Array.isArray(r.turns) ? r.turns : [];
}

/** מוחק את השיחה השמורה בחשבון */
export async function clearPrivateHistory() {
  const token = getToken();
  if (token) await call("history", { token, clear: true });
}

/** מגביל את ההיסטוריה שנשלחת לשרת: עד שש שאלות ותשובות אחרונות (מתחיל תמיד בשאלה) */
export const recentTurns = (history: PrivateTurn[]): PrivateTurn[] => history.slice(-10);

/** שאלה אחת בצ'אט הפרטי. history = זוגות שאלה–תשובה קודמים. מחזיר את התשובה, או סוג השגיאה. */
export async function askPrivate(history: PrivateTurn[], question: string): Promise<{ ok: true; text: string } | { ok: false; error: PrivateError }> {
  const token = getToken();
  const device = readDevice();
  if (!token && !device) return { ok: false, error: "unauthorized" };
  const data = await call("ask", { ...(token ? { token } : {}), ...(device ? { key: device } : {}), messages: [...recentTurns(history), { role: "user", text: question }] });
  if (data.ok && typeof data.text === "string") return { ok: true, text: data.text };
  const e = data.error;
  if (e === "no_key") emit({ token, has: false });
  return { ok: false, error: e === "bad_key" || e === "quota" || e === "rate" || e === "offline" || e === "no_key" || e === "unauthorized" ? e : "unavailable" };
}

export const PRIVATE_ERROR_TEXT: Record<PrivateError, string> = {
  bad_key: "הספק לא קיבל את המפתח. בדקו שהועתק במלואו ושהשירות פעיל בחשבון שלכם.",
  quota: "המפתח חרג מהמכסה או מהתקציב שלו אצל הספק. בדקו בחשבון שלכם.",
  rate: "יותר מדי שאלות היום מהחשבון הזה. נסו שוב מחר.",
  no_key: "לא נמצא מפתח שמור בחשבון. חברו מפתח מחדש.",
  unauthorized: "כדי לשאול צריך להיכנס לחשבון.",
  unavailable: "לא הצלחנו לקבל תשובה כרגע. נסו שוב בעוד רגע.",
  offline: "אין חיבור לשרת האתר.",
};
