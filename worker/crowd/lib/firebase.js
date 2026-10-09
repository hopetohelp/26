/**
 * אימות מייל דרך Firebase Authentication (שירות חינמי של Google; הכרעת בעלים 9.10.2026).
 * רק קריאות REST מהשרת, עם מפתח ה-Web של הפרויקט (FIREBASE_API_KEY — מפתח גלוי לפי Firebase, לא סוד).
 * השיטה: לכל חשבון שמבקש אימות נוצר ב-Firebase משתמש זמני עם סיסמה אקראית ארוכה (נשמרת מוצפנת אצלנו בלבד —
 * סיסמת האתר של הגולש אינה נשלחת לשום מקום). Firebase שולח את מייל האימות (קישור) מכתובת משלו;
 * אחרי שהגולש לוחץ, השרת מתחבר למשתמש הזמני ובודק emailVerified. כשאומת — המשתמש ב-Firebase נמחק.
 */
const BASE = "https://identitytoolkit.googleapis.com/v1/accounts:";

export class FirebaseError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function call(env, method, body) {
  if (!env.FIREBASE_API_KEY) throw new FirebaseError("NOT_CONFIGURED");
  let res;
  try {
    res = await fetch(`${BASE}${method}?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new FirebaseError("NETWORK");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new FirebaseError(String(data?.error?.message || `HTTP_${res.status}`).split(" ")[0]);
  return data;
}

/** סיסמה אקראית שעוברת גם מדיניות סיסמאות מחמירה (אות גדולה, קטנה, ספרה, תו מיוחד) */
export function randomPassword() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "x").replace(/\//g, "y").replace(/=+$/, "") + "Aa1!";
}

/** משתמש חדש ⇐ idToken. מייל שכבר קיים ב-Firebase ⇐ FirebaseError("EMAIL_EXISTS") */
export const signUp = (env, email, password) => call(env, "signUp", { email, password, returnSecureToken: true }).then((r) => r.idToken);

export const signIn = (env, email, password) => call(env, "signInWithPassword", { email, password, returnSecureToken: true }).then((r) => r.idToken);

/** שליחת מייל האימות. continueUrl = לאן חוזרים אחרי הלחיצה (חייב להיות דומיין מורשה ב-Firebase); נדחה ⇐ ניסיון בלעדיו */
export async function sendVerify(env, idToken, continueUrl) {
  try {
    await call(env, "sendOobCode", { requestType: "VERIFY_EMAIL", idToken, ...(continueUrl ? { continueUrl } : {}) });
  } catch (e) {
    if (continueUrl && /CONTINUE_URI|UNAUTHORIZED_DOMAIN|INVALID_CONTINUE/.test(e.code)) return call(env, "sendOobCode", { requestType: "VERIFY_EMAIL", idToken });
    throw e;
  }
}

export async function isVerified(env, idToken) {
  const r = await call(env, "lookup", { idToken });
  return r.users?.[0]?.emailVerified === true;
}

/** מחיקת המשתמש הזמני ב-Firebase — כך המייל לא נשאר אצלם */
export const removeUser = (env, idToken) => call(env, "delete", { idToken });
