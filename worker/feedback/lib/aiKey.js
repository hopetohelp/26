/**
 * מפתח ה-AI של שרת ההערות — הבית היחיד לשמירה ולקריאה שלו (הכרעת בעלים 12.10.2026).
 * נשמר ב-D1 (settings.ai_key) מוצפן ב-AES-GCM במפתח שנגזר מסוד השרת IP_KEY, כך שקריאת המאגר לבדה אינה חושפת אותו.
 * דרך נוספת: סוד השרת AI_API_KEY (מהגדרות הריפו). המפתח שנשמר ממסך הניהול קודם לסוד.
 */

async function cipher(env, label = "ai-key") {
  if (!env.IP_KEY) return null;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${label}|${env.IP_KEY}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** מצפין מפתח לאחסון. null אם אין סוד שרת להצפנה. */
export async function sealKey(env, value, label) {
  const c = await cipher(env, label);
  if (!c) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, c, new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...iv, ...sealed));
}

/** המפתח בפועל לשימוש השרת: ממסך הניהול, ואם אין — סוד השרת. null אם אין או שאי אפשר לפענח. */
export async function openKey(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE name = 'ai_key'").first();
  if (row) {
    const c = await cipher(env);
    if (c) {
      try {
        const bytes = Uint8Array.from(atob(row.value), (ch) => ch.charCodeAt(0));
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, c, bytes.slice(12));
        return new TextDecoder().decode(plain);
      } catch { /* סוד ההצפנה הוחלף — ממשיכים לסוד השרת */ }
    }
  }
  return env.AI_API_KEY || null;
}

/** פענוח ערך שהוצפן ב-sealKey באותה תווית. null אם אין סוד או שהסוד הוחלף. */
export async function unsealKey(env, packed, label) {
  const c = await cipher(env, label);
  if (!c || !packed) return null;
  try {
    const bytes = Uint8Array.from(atob(packed), (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, c, bytes.slice(12)));
  } catch { return null; }
}

/*
 * המפתח האישי של משתמש לצ'אט החכם (הכרעת בעלים 18.10.2026, מחליפה את "בדפדפן בלבד" של 14.10.2026):
 * נשמר בשרת לפי החשבון, מוצפן בתווית נפרדת ממפתח האתר, ולעולם אינו מוחזר — כך הוא זמין לבעליו מכל מכשיר.
 */
const PERSONAL = "private-key";
export const sealPersonalKey = (env, value) => sealKey(env, value, PERSONAL);
export const unsealPersonalKey = (env, packed) => unsealKey(env, packed, PERSONAL);

/** היסטוריית הצ'אט הפרטי של חשבון (הכרעת בעלים 18.10.2026): נשמרת מוצפנת בתווית נפרדת, ומוחזרת רק לבעליה */
const CHATS = "private-chat";
export const sealChat = (env, turns) => sealKey(env, JSON.stringify(turns), CHATS);
export async function unsealChat(env, packed) {
  const raw = await unsealKey(env, packed, CHATS);
  try { const t = JSON.parse(raw ?? "[]"); return Array.isArray(t) ? t : []; } catch { return []; }
}
