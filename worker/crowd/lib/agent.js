/**
 * כניסת עוזר AI (שרת ה-MCP, worker/mcp; הכרעת בעלים 12.10.2026): סשן נפרד מסשן הדפדפן, שנוצר רק מתוך סשן דפדפן
 * (POST /auth/delegate, מסך "חיבור עוזר AI" באתר), נראה ברשימה "החיבורים שלי" ואפשר לנתק אותו לבד.
 *
 * 🔴 "דלת אחת": מה שעוזר יכול נקבע כאן ורק כאן, בבדיקה אחת לפני כל נתיב (`agentGate` ב-index.js) — לא בכל נתיב לחוד.
 * נתיב שאינו ברשימה ⇐ 403 `assistant_not_allowed`, גם אם שרת ה-MCP ביקש אותו בטעות. נתיב חדש באתר אינו נפתח לעוזר מעצמו.
 * הכלל: כל פעולה שפתוחה למשתמש באתר — חוץ מהחריגים שהבעלים קבע (12.10.2026):
 *   · סיסמה, מייל וחיבור Google — מי ששולט בעוזר לא יוכל להשתלט על החשבון;
 *   · מחיקת החשבון — פעולה בלי חזרה, רק בלחיצה של המשתמש באתר;
 *   · מחיקת קבוצה והסרת מנהלי קבוצות (מסך הניהול);
 *   · יצירת כניסת עוזר נוספת וניתוק חיבורים — רק מהדפדפן;
 *   · שיחות הצוות של אחרים (תשובות, טיוטות והשהיה במסך הניהול) — רק במסך הניהול.
 * שיחת המשתמש עם הצוות (שלב 3) פתוחה: שרת ההערות מזהה את המשתמש דרך GET /support/access, כמו מהאתר, ומסמן
 * הודעה שנכתבה דרך עוזר (`via`) — וכל נוהל ההערות חל עליה כמו שהוא.
 */
import { sha256 } from "./crypto.js";

/** תוקף כניסת עוזר — כמו סשן רגיל */
export const AGENT_SESSION_MS = 30 * 24 * 3600 * 1000;
/** כמה עוזרים מחוברים לכל היותר לחשבון אחד */
export const MAX_AGENTS = 10;
/** עדכון "שימוש אחרון" לכל היותר פעם בשעה, כדי שכל קריאה לא תהיה כתיבה */
const TOUCH_MS = 3600 * 1000;

/**
 * הנתיבים שעוזר מחובר רשאי להם. ערך true = מותר; פונקציה = מותר רק אם הגוף עומד בתנאי.
 * מנהל האתר: אותם נתיבים שמסך הניהול קורא להם (הכרעת בעלים: "את כל האפשרויות"), פחות החריגים.
 */
export const AGENT_ROUTES = {
  // האזור האישי — קריאה
  "GET /me": true,
  "GET /history": true,
  "GET /export": true,
  "GET /dashboard": true,
  "GET /group/mine": true,
  "GET /group/stats": true,
  // שיחת המשתמש עם צוות האתר — שרת ההערות מזהה דרכו את המשתמש (ואת העוזר: via)
  "GET /support/access": true,
  // האזור האישי — כתיבה (אותה בדיקה ואותה הגבלת קצב כמו בדפדפן)
  "POST /save": true,
  "POST /prefs": true,
  "POST /history/clear": true,
  "POST /account/name": true,
  "POST /group/import": true,
  // מסך הניהול (GET /admin/whoami אינו כאן בכוונה: דרכו שרת ההערות מזהה מנהל, ושיחות הצוות נפתחות לעוזר רק בשלב 3)
  "GET /admin/guesses": true,
  "POST /admin/guesses/decide": true,
  "GET /admin/blocs": true,
  "GET /admin/groups": true,
  "POST /admin/groups/import": true,
  "POST /admin/groups/stats": true,
  // מינוי מנהל קבוצה — כן; הסרה — רק במסך הניהול
  "POST /admin/groups/managers": (body) => !body.remove,
};

/** האם נתיב פתוח לעוזר (בלי לבדוק את הגוף) */
export const agentRoute = (method, path) => AGENT_ROUTES[`${method} ${path}`];

/** תנאי הגוף של נתיב, אם יש. false ⇐ אסור */
export function agentBodyAllowed(method, path, body) {
  const rule = agentRoute(method, path);
  return typeof rule === "function" ? !!rule(body ?? {}) : !!rule;
}

/** האסימון שבבקשה — Bearer, או מפתח הניהול (מנהל מחובר שולח את הסשן ב-x-admin-key) */
export function requestToken(request) {
  const h = (request.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+([\w-]{20,100})$/i.exec(h);
  if (m) return m[1];
  const k = request.headers.get("x-admin-key") || "";
  return /^[\w-]{32,100}$/.test(k) ? k : null;
}

/** כניסת עוזר תקפה ⇐ {participant, client, tokenHash}; אחרת null */
export async function agentSession(env, token, now) {
  if (!token) return null;
  const th = await sha256(token);
  const row = await env.DB.prepare("SELECT participant, client, last_used_at FROM agent_sessions WHERE token_hash = ? AND revoked = 0 AND expires_at > ?")
    .bind(th, new Date(now).toISOString())
    .first();
  if (!row) return null;
  if (!row.last_used_at || Date.parse(row.last_used_at) < now - TOUCH_MS)
    await env.DB.prepare("UPDATE agent_sessions SET last_used_at = ? WHERE token_hash = ?").bind(new Date(now).toISOString(), th).run();
  return { participant: row.participant, client: row.client, tokenHash: th };
}

/** שם העוזר כפי שהמשתמש יראה אותו ברשימה — טקסט קצר בלבד */
export function clientLabel(v) {
  const s = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 60) : "";
  return s || "עוזר AI";
}

/** מזהה חיבור לתצוגה ולניתוק: 16 התווים הראשונים של הגיבוב (לא האסימון) */
export const connectionId = (tokenHash) => tokenHash.slice(0, 16);
