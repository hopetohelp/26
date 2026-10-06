/**
 * זהות, סשנים והגבלת קצב.
 * - סשן: אסימון אקראי של 256 ביט; במאגר רק SHA-256 שלו. תוקף 30 יום.
 * - הקישור האישי (credentials.kind = 'link') מכניס דרך /auth/link (סשן חדש) ומשחזר סיסמה דרך /auth/recover. הוא עצמו אינו Bearer.
 * - הגבלת קצב: מונים במאגר בחלונות של שעה, ספירה "מתגלגלת" (החלון הנוכחי + החלק היחסי מהקודם), עדכון אטומי.
 */
import { randomToken, sha256, hmac, ipPrefix } from "./crypto.js";

export const SESSION_MS = 30 * 24 * 3600 * 1000;
export const HOUR = 3600 * 1000;

export function bearer(request) {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+([\w-]{20,100})$/i.exec(h.trim());
  return m ? m[1] : null;
}

/** אסימון סשן ⇐ {participant, session: token_hash} או null */
export async function authenticate(env, token, now) {
  if (!token) return null;
  const th = await sha256(token);
  const s = await env.DB.prepare("SELECT participant FROM sessions WHERE token_hash = ? AND revoked = 0 AND expires_at > ?")
    .bind(th, new Date(now).toISOString())
    .first();
  return s ? { participant: s.participant, session: th } : null;
}

/** סשן חדש ⇐ [statement, token] */
export async function newSession(env, participant, now) {
  const token = randomToken();
  const stmt = env.DB.prepare("INSERT INTO sessions (token_hash, participant, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(
    await sha256(token),
    participant,
    new Date(now).toISOString(),
    new Date(now + SESSION_MS).toISOString(),
  );
  return [stmt, token];
}

/**
 * גיבובי ה-IP: [מפתח נוכחי, מפתח קודם?]. בהחלפת IP_KEY שמים את הישן ב-IP_KEY_PREV ל-24 שעות,
 * כדי שמונים שנצברו לפני ההחלפה ימשיכו להיספר. כותבים תמיד רק בגיבוב הנוכחי.
 */
export async function ipKeys(env, request) {
  const ip = ipPrefix(request.headers.get("cf-connecting-ip") || "");
  const keys = [await hmac(env.IP_KEY, ip)];
  if (env.IP_KEY_PREV) keys.push(await hmac(env.IP_KEY_PREV, ip));
  return keys;
}

/**
 * מוסיף 1 למונה ובודק את הספירה המתגלגלת מול המגבלה. מחזיר true אם מותר.
 * הספירה כוללת את הניסיון הנוכחי (גם ניסיון שנדחה נספר — מי שמנסה שוב ושוב נשאר חסום).
 */
export async function hit(env, key, limit, now, windowMs = HOUR, alsoRead = []) {
  const start = Math.floor(now / windowMs) * windowMs;
  let extra = 0;
  for (const k of alsoRead) {
    const a = await env.DB.prepare("SELECT count FROM rate WHERE key = ? AND window_start = ?").bind(k, start).first();
    const b = await env.DB.prepare("SELECT count FROM rate WHERE key = ? AND window_start = ?").bind(k, start - windowMs).first();
    extra += (a?.count ?? 0) + (b?.count ?? 0) * (1 - (now - start) / windowMs);
  }
  const row = await env.DB.prepare(
    "INSERT INTO rate (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count",
  )
    .bind(key, start)
    .first();
  const prev = await env.DB.prepare("SELECT count FROM rate WHERE key = ? AND window_start = ?").bind(key, start - windowMs).first();
  const weight = 1 - (now - start) / windowMs;
  return row.count + (prev?.count ?? 0) * weight + extra <= limit;
}

// ---- עיכוב מדורג אחרי כניסות כושלות (בלי נעילה). מונה לפי חשבון ולפי IP.
// מצב שמור בטבלת rate: key = 'fail:...', window_start = זמן הכישלון האחרון, count = כישלונות רצופים.
const FREE_FAILS = 3;
const MAX_DELAY = 60 * 1000;
export const failDelay = (fails) => (fails < FREE_FAILS ? 0 : Math.min(MAX_DELAY, 1000 * 2 ** (fails - FREE_FAILS)));

async function failState(env, key) {
  return env.DB.prepare("SELECT window_start AS at, count FROM rate WHERE key = ? ORDER BY window_start DESC LIMIT 1").bind(key).first();
}

/** כמה מילישניות עוד צריך לחכות (0 = מותר לנסות) */
export async function waitMs(env, keys, now) {
  let wait = 0;
  for (const k of keys) {
    const s = await failState(env, k);
    if (s) wait = Math.max(wait, s.at + failDelay(s.count) - now);
  }
  return Math.max(0, wait);
}

export async function recordFail(env, keys, now) {
  for (const k of keys) {
    const s = await failState(env, k);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rate WHERE key = ?").bind(k),
      env.DB.prepare("INSERT INTO rate (key, window_start, count) VALUES (?, ?, ?)").bind(k, now, (s?.count ?? 0) + 1),
    ]);
  }
}

export async function clearFails(env, keys) {
  for (const k of keys) await env.DB.prepare("DELETE FROM rate WHERE key = ?").bind(k).run();
}
