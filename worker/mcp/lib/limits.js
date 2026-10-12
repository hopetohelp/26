/**
 * הגבלת קצב ותיעוד שימוש — בלי פרטים מזהים (הכרעת בעלים 12.10.2026).
 * - קצב: חיבור מחובר — לפי גיבוב מזהה החיבור; הכתובת הציבורית — לפי גיבוב כתובת הרשת (HMAC עם IP_KEY, IPv6 נחתך ל-/64).
 *   המונים נמחקים אחרי יממה. ההגבלה מגינה על השרת; את כל השאר (כמה שמירות בשעה וכו') קובע שרת ההשתתפות, כמו באתר.
 * - שימוש: מונה לכל (יום, כלי, סוג הכתובת, שם העוזר, תוצאה). אין מזהה משתמש, אין כתובת ואין תוכן.
 */
import { hmac, ipPrefix, sha256 } from "../../crowd/lib/crypto.js";

export const LIMITS = { user: 300, public: 60 };
const HOUR = 3600 * 1000;

/** ⇐ true אם מותר. ספירה מתגלגלת: החלון הנוכחי + החלק היחסי מהקודם (כמו בשרת ההשתתפות) */
export async function allow(env, key, limit, now) {
  const start = now - (now % HOUR);
  const row = await env.DB.prepare("SELECT window_start, count FROM rate WHERE key = ?").bind(key).first();
  let count = 1;
  let prev = 0;
  if (row && row.window_start === start) count = row.count + 1;
  else if (row && row.window_start === start - HOUR) prev = row.count;
  const rolling = count + prev * (1 - (now - start) / HOUR);
  await env.DB.prepare("INSERT INTO rate (key, window_start, count) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count")
    .bind(key, start, count).run();
  return rolling <= limit;
}

export const userKey = async (grantId) => "u:" + (await sha256("grant|" + grantId)).slice(0, 32);
export const publicKey = async (env, request) => "ip:" + (await hmac(env.IP_KEY, ipPrefix(request.headers.get("cf-connecting-ip") || ""))).slice(0, 32);

const day = (now) => new Date(now).toISOString().slice(0, 10);
/** שם העוזר בקצרה — "Claude", "ChatGPT" — לא יותר */
const clientTag = (name) => (typeof name === "string" ? name.replace(/[^\p{L}\p{N} .-]/gu, "").trim().slice(0, 24) : "") || "אחר";

export async function logUse(env, { tool, mode, client, outcome }, now) {
  try {
    await env.DB.prepare("INSERT INTO usage (day, tool, mode, client, outcome, n) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(day, tool, mode, client, outcome) DO UPDATE SET n = n + 1")
      .bind(day(now), String(tool).slice(0, 48), mode, clientTag(client), outcome).run();
  } catch { /* תיעוד אינו מפיל קריאה */ }
}

export async function cleanupLimits(env, now) {
  await env.DB.prepare("DELETE FROM rate WHERE window_start < ?").bind(now - 24 * HOUR).run();
}
