/**
 * שרת הפידבק (Cloudflare Worker + D1). בלי מייל, בלי חשבון, ובלי שמירת IP.
 *
 * POST /            {topic, text, page, theme, website} ⇐ הערה חדשה. מחזיר {ok, token}: הקישור האישי של הגולש.
 * GET  /thread?t=   ⇐ ההערה והשיחה עליה (רק למי שמחזיק את הקישור).
 * POST /thread      {t, text, website} ⇐ תגובה של הגולש בשיחה.
 * POST /hit         {page} ⇐ מונה כניסות: +1 לעמוד באותו יום, וגם ספירת גולשים שונים (מזהה אנונימי שמתחלף מדי יום).
 *                    המזהה הוא גיבוב חד-כיווני של ה-IP, הדפדפן והתאריך: בלי עוגיות, ואי אפשר לשחזר ממנו כתובת או לקשור גולש בין ימים.
 *
 * - הקישור האישי: 128 ביט אקראיים. במאגר נשמר רק הגיבוב שלו, כך שגם מי שקורא את המאגר אינו יכול לפתוח שיחה.
 * - תשובות הצוות נכתבות ישירות במאגר (author = 'team'), לא דרך השרת — אין כאן נקודת כניסה לכתיבה בשם הצוות.
 * - "website" הוא שדה מלכודת שגולש אמיתי לא רואה; מילוי שלו = רובוט, ומחזירים "הצלחה" בלי לשמור.
 * - להגבלת קצב נשמר רק גיבוב של ה-IP עם התאריך: עד 8 הודעות ביום מאותו מקור (הערות ותגובות יחד).
 */
const TOPICS = new Set(["data", "idea", "design", "other"]);
const MAX_TEXT = 2000;
const MAX_PER_DAY = 8;
const MAX_MESSAGES = 30;
const HIT_PAGES = new Set(["/", "/today", "/polls", "/changes", "/calculator", "/past", "/method", "/thread"]);

function cors(env, origin) {
  const allowed = origin === env.ALLOWED_ORIGIN || /^http:\/\/localhost:\d+$/.test(origin || "");
  return {
    "access-control-allow-origin": allowed ? origin : env.ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

async function dayKey(ip) {
  const day = new Date().toISOString().slice(0, 10);
  return (await sha256(`${day}|${ip}|elections26`)).slice(0, 24);
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** הודעות היום מאותו מקור — הערות ותגובות יחד */
async function sentToday(env, key) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM feedback WHERE day_key = ?1 AND created_at >= ?2) + (SELECT COUNT(*) FROM messages WHERE day_key = ?1 AND created_at >= ?2) AS n",
  ).bind(key, day).first();
  return row?.n ?? 0;
}

async function findThread(env, token) {
  if (!token || typeof token !== "string" || token.length > 64) return null;
  const row = await env.DB.prepare("SELECT id, created_at, topic, text, status FROM feedback WHERE token_hash = ?")
    .bind(await sha256(token)).first();
  return row || null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    const headers = { ...cors(env, origin), "content-type": "application/json; charset=utf-8" };
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);

    // ---- קריאת שיחה
    if (request.method === "GET" && url.pathname === "/thread") {
      const fb = await findThread(env, url.searchParams.get("t"));
      if (!fb) return reply({ ok: false, error: "not found" }, 404);
      const { results } = await env.DB.prepare("SELECT author, text, created_at FROM messages WHERE feedback_id = ? ORDER BY id")
        .bind(fb.id).all();
      return reply({ ok: true, topic: fb.topic, text: fb.text, created_at: fb.created_at, status: fb.status, messages: results || [] });
    }
    if (request.method !== "POST") return reply({ ok: false }, 405);

    // ---- מונה כניסות: רק עמודים מוכרים, ונשמר רק המספר ליום ולעמוד
    if (url.pathname === "/hit") {
      let page = "";
      try {
        page = String((await request.json()).page || "");
      } catch {
        return reply({ ok: false }, 400);
      }
      if (!HIT_PAGES.has(page)) return reply({ ok: false }, 400);
      const day = new Date().toISOString().slice(0, 10);
      const vid = await dayKey(`${request.headers.get("cf-connecting-ip") || "unknown"}|${request.headers.get("user-agent") || ""}`);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO hits (day, page, count) VALUES (?, ?, 1) ON CONFLICT(day, page) DO UPDATE SET count = count + 1").bind(day, page),
        env.DB.prepare("INSERT OR IGNORE INTO visitors (day, vid, page) VALUES (?, ?, ?)").bind(day, vid, page),
      ]);
      return reply({ ok: true });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return reply({ ok: false, error: "bad json" }, 400);
    }
    if (body.website) return reply({ ok: true }); // מלכודת
    const text = String(body.text || "").trim().slice(0, MAX_TEXT);
    if (!text) return reply({ ok: false, error: "empty" }, 400);
    const key = await dayKey(request.headers.get("cf-connecting-ip") || "unknown");
    if ((await sentToday(env, key)) >= MAX_PER_DAY) return reply({ ok: false, error: "rate" }, 429);
    const now = new Date().toISOString();

    // ---- תגובת הגולש בשיחה
    if (url.pathname === "/thread") {
      const fb = await findThread(env, body.t);
      if (!fb) return reply({ ok: false, error: "not found" }, 404);
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE feedback_id = ?").bind(fb.id).first();
      if ((count?.n ?? 0) >= MAX_MESSAGES) return reply({ ok: false, error: "full" }, 429);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO messages (feedback_id, created_at, author, text, day_key) VALUES (?, ?, 'visitor', ?, ?)")
          .bind(fb.id, now, text, key),
        env.DB.prepare("UPDATE feedback SET status = 'new' WHERE id = ?").bind(fb.id),
      ]);
      return reply({ ok: true });
    }

    // ---- הערה חדשה
    const topic = TOPICS.has(body.topic) ? body.topic : "other";
    const token = newToken();
    await env.DB.prepare(
      "INSERT INTO feedback (created_at, topic, text, page, theme, day_key, token_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'new')",
    )
      .bind(now, topic, text, String(body.page || "").slice(0, 120), String(body.theme || "").slice(0, 20), key, await sha256(token))
      .run();
    return reply({ ok: true, token });
  },
};
