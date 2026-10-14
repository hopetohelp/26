/**
 * הצ'אט הפרטי עם מפתח AI אישי (הכרעת בעלים 14.10.2026). הבעלים היחיד של המפתח האישי בדפדפן ושל הקריאה ל-`/private/ask`.
 *
 * 🔴 הפרדה מלאה מהצ'אט עם צוות האתר ומכל מה שהאתר שומר:
 *  - המפתח נשמר בדפדפן הזה בלבד — כברירת מחדל ב-sessionStorage (נמחק בסגירת הלשונית); רק בבחירה "לזכור" גם ב-localStorage. אינו נשמר בשרת.
 *  - המפתח נשלח רק ל-`/private/ask` ומשם לספק שלו; לעולם לא לשרת ההשתתפות, לשיחות הצוות או לכל נתיב אחר.
 *  - הבקשה אינה נושאת אסימון חשבון, שיחה או מזהה כלשהו; השיחה עצמה נשארת בזיכרון הדף ואינה נשמרת בשום מקום.
 */
import { useSyncExternalStore } from "react";
import { FEEDBACK_URL } from "./feedback";

const KEY = "elections26.privateKey";
const EVENT = "elections26:private-key";

export interface PrivateTurn { role: "user" | "assistant"; text: string }
export type PrivateError = "bad_key" | "quota" | "rate" | "unavailable" | "offline";

/** צורת מפתח סבירה: בלי רווחים, באורך שהשרת מקבל */
export const isPlausibleKey = (k: string) => k.length >= 20 && k.length <= 400 && !/\s/.test(k);

function read(): string | null {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try { const v = store().getItem(KEY); if (v && isPlausibleKey(v)) return v; } catch { /* אחסון חסום */ }
  }
  return null;
}

export const getPrivateKey = read;

const notify = () => { try { window.dispatchEvent(new Event(EVENT)); } catch { /* סביבה בלי חלון */ } };

/** שומר את המפתח בדפדפן. remember=false ⇐ עד סגירת הלשונית. false ⇐ הדפדפן חוסם אחסון. */
export function setPrivateKey(key: string, remember: boolean): boolean {
  clearPrivateKey();
  try { (remember ? localStorage : sessionStorage).setItem(KEY, key.trim()); } catch { return false; }
  notify();
  return true;
}

export function clearPrivateKey() {
  for (const store of [() => sessionStorage, () => localStorage]) { try { store().removeItem(KEY); } catch { /* אחסון חסום */ } }
  notify();
}

/** המפתח האישי הנוכחי (או null), מתעדכן בכל לשונית */
export function usePrivateKey(): string | null {
  return useSyncExternalStore(
    (cb) => { window.addEventListener(EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); }; },
    read,
    () => null,
  );
}

/** מגביל את ההיסטוריה שנשלחת לשרת: עד שש שאלות ותשובות אחרונות (מתחיל תמיד בשאלה) */
export const recentTurns = (history: PrivateTurn[]): PrivateTurn[] => history.slice(-10);

/** שאלה אחת בצ'אט הפרטי. history = זוגות שאלה–תשובה קודמים. מחזיר את התשובה, או סוג השגיאה. */
export async function askPrivate(key: string, history: PrivateTurn[], question: string): Promise<{ ok: true; text: string } | { ok: false; error: PrivateError }> {
  if (!FEEDBACK_URL) return { ok: false, error: "offline" };
  try {
    const res = await fetch(`${FEEDBACK_URL}/private/ask`, {
      method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, messages: [...recentTurns(history), { role: "user", text: question }] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && typeof data.text === "string") return { ok: true, text: data.text };
    const e = data.error;
    return { ok: false, error: e === "bad_key" || e === "quota" || e === "rate" ? e : "unavailable" };
  } catch {
    return { ok: false, error: "offline" };
  }
}

export const PRIVATE_ERROR_TEXT: Record<PrivateError, string> = {
  bad_key: "הספק לא קיבל את המפתח. בדקו שהועתק במלואו ושהשירות פעיל בחשבון שלכם.",
  quota: "המפתח חרג מהמכסה או מהתקציב שלו אצל הספק. בדקו בחשבון שלכם.",
  rate: "יותר מדי שאלות היום ממקור זה. נסו שוב מחר.",
  unavailable: "לא הצלחנו לקבל תשובה כרגע. נסו שוב בעוד רגע.",
  offline: "אין חיבור לשרת האתר.",
};
