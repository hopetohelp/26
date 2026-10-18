/**
 * הצ'אט החכם עם מפתח AI אישי. הבעלים היחיד של המפתח האישי ושל הקריאות ל-`/private/key` ו-`/private/ask`.
 *
 * 🔴 הכרעת בעלים 18.10.2026 (מחליפה את "בדפדפן בלבד" של 14.10.2026): המפתח נשמר בשרת לפי החשבון, מוצפן,
 * ואינו חוזר לדפדפן לעולם — כך הוא זמין לבעליו מכל מכשיר. לכן הצ'אט דורש כניסה לחשבון.
 * השיחה עצמה נשארת בזיכרון הדף ואינה נשמרת בשרת, ונפרדת לגמרי מהשיחה עם צוות האתר.
 */
import { useEffect, useSyncExternalStore } from "react";
import { FEEDBACK_URL } from "./feedback";
import { getToken } from "./crowdSession";

/** המפתח נשמר בעבר בדפדפן; בכניסה הראשונה עם חשבון הוא עובר לשרת ונמחק מכאן */
const LEGACY = "elections26.privateKey";

export interface PrivateTurn { role: "user" | "assistant"; text: string }
export type PrivateError = "bad_key" | "quota" | "rate" | "unavailable" | "offline" | "no_key" | "unauthorized";

/** צורת מפתח סבירה: בלי רווחים, באורך שהשרת מקבל */
export const isPlausibleKey = (k: string) => k.length >= 20 && k.length <= 400 && !/\s/.test(k);

/** האם לחשבון המחובר יש מפתח שמור בשרת (null = לא ידוע / לא מחוברים) */
let state: { token: string | null; has: boolean | null } = { token: null, has: null };
const listeners = new Set<() => void>();
const emit = (next: typeof state) => { state = next; listeners.forEach((l) => l()); };

async function call(body: object): Promise<{ ok: boolean; has?: boolean; error?: string; text?: string; status: number }> {
  if (!FEEDBACK_URL) return { ok: false, error: "offline", status: 0 };
  try {
    const res = await fetch(`${FEEDBACK_URL}${"messages" in body ? "/private/ask" : "/private/key"}`, {
      method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { ...(await res.json().catch(() => ({}))), status: res.status };
  } catch { return { ok: false, error: "offline", status: 0 }; }
}

function takeLegacy(): string | null {
  let found: string | null = null;
  for (const store of [() => sessionStorage, () => localStorage]) {
    try { const v = store().getItem(LEGACY); if (v && isPlausibleKey(v)) found = found ?? v; store().removeItem(LEGACY); } catch { /* אחסון חסום */ }
  }
  return found;
}

/** בודק מול השרת אם לחשבון יש מפתח; מפתח ישן מהדפדפן עובר לשרת */
export async function refreshPrivateKey(token = getToken()) {
  if (!token) return emit({ token: null, has: null });
  const legacy = takeLegacy();
  const r = await call(legacy ? { token, key: legacy } : { token });
  if (getToken() === token) emit({ token, has: r.ok ? !!r.has : null });
}

/** שומר את המפתח בשרת לחשבון המחובר. מחזיר שגיאה, או null בהצלחה */
export async function savePrivateKey(key: string): Promise<string | null> {
  const token = getToken();
  if (!token) return "כדי לחבר מפתח צריך להיכנס לחשבון.";
  const r = await call({ token, key: key.trim() });
  if (!r.ok) return r.error === "bad_key" ? "המפתח לא נראה תקין. בדקו שהועתק במלואו, בלי רווחים." : "לא הצלחנו לשמור את המפתח כרגע. נסו שוב בעוד רגע.";
  emit({ token, has: !!r.has });
  return null;
}

export async function removePrivateKey() {
  const token = getToken();
  takeLegacy();
  if (!token) return emit({ token: null, has: null });
  const r = await call({ token, key: null });
  emit({ token, has: r.ok ? !!r.has : state.has });
}

/** האם לחשבון המחובר יש מפתח AI אישי שמור; נבדק מול השרת בכל החלפת חשבון */
export function usePrivateKey(): boolean {
  const token = getToken();
  const snap = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
  useEffect(() => { if (snap.token !== token) void refreshPrivateKey(token); }, [token, snap.token]);
  return snap.token === token && !!token && snap.has === true;
}

/** מגביל את ההיסטוריה שנשלחת לשרת: עד שש שאלות ותשובות אחרונות (מתחיל תמיד בשאלה) */
export const recentTurns = (history: PrivateTurn[]): PrivateTurn[] => history.slice(-10);

/** שאלה אחת בצ'אט הפרטי. history = זוגות שאלה–תשובה קודמים. מחזיר את התשובה, או סוג השגיאה. */
export async function askPrivate(history: PrivateTurn[], question: string): Promise<{ ok: true; text: string } | { ok: false; error: PrivateError }> {
  const token = getToken();
  if (!token) return { ok: false, error: "unauthorized" };
  const data = await call({ token, messages: [...recentTurns(history), { role: "user", text: question }] });
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
