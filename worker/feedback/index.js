/**
 * שרת הפידבק (Cloudflare Worker + D1). בלי מייל, בלי חשבון, ובלי שמירת IP.
 *
 * POST /            {topic, text, page, theme, website} ⇐ הערה חדשה. מחזיר {ok, token}: הקישור האישי של הגולש.
 * GET  /thread?t=   ⇐ ההערה והשיחה עליה (רק למי שמחזיק את הקישור).
 * POST /thread      {t, text, website} ⇐ תגובה של הגולש בשיחה.
 * POST /merge       {tokens} ⇐ איחוד השיחות שהגולש מחזיק בכל הקישורים שלהן. הקישורים נשארים תקפים.
 * POST /hit         {page} ⇐ מונה כניסות: +1 לעמוד באותו יום, וגם ספירת גולשים שונים (מזהה אנונימי שמתחלף מדי יום).
 *                    המזהה היומי הוא גיבוב חד-כיווני של ה-IP, הדפדפן והתאריך: אי אפשר לשחזר ממנו כתובת או לקשור גולש בין ימים.
 *                    {v} = מזהה אקראי של הדפדפן (localStorage) לספירה מצטברת; נשמר רק גיבוב שלו, יחד עם יום ראשון ואחרון.
 *
 * - הקישור האישי: 128 ביט אקראיים. במאגר נשמר רק הגיבוב שלו, כך שגם מי שקורא את המאגר אינו יכול לפתוח שיחה.
 * - תשובות הצוות נכתבות ישירות במאגר (author = 'team'), לא דרך השרת — אין כאן נקודת כניסה לכתיבה בשם הצוות.
 * - הערה חדשה באותו נוסח בדיוק מאותו מקור באותו יום אינה נשמרת שוב (מחזירים {ok, duplicate}, בלי token).
 * - "website" הוא שדה מלכודת שגולש אמיתי לא רואה; מילוי שלו = רובוט, ומחזירים "הצלחה" בלי לשמור.
 * - להגבלת קצב נשמר רק גיבוב של ה-IP עם התאריך: עד 8 הודעות ביום מאותו מקור (הערות ותגובות יחד).
 */
const TOPICS = new Set(["data", "idea", "design", "other"]);
const MAX_TEXT = 2000;
const MAX_PER_DAY = 8;
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
  if (!row) return null;
  const group = await env.DB.prepare("SELECT root_id FROM feedback_threads WHERE feedback_id = ?").bind(row.id).first();
  if (!group || group.root_id === row.id) return row;
  return env.DB.prepare("SELECT id, created_at, topic, text, status FROM feedback WHERE id = ?").bind(group.root_id).first();
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
      const members = "SELECT feedback_id FROM feedback_threads WHERE root_id = ?1 UNION SELECT ?1";
      const { results: notes } = await env.DB.prepare(`SELECT id, created_at, topic, text, status FROM feedback WHERE id IN (${members}) ORDER BY created_at, id`).bind(fb.id).all();
      const { results } = await env.DB.prepare(`SELECT author, text, created_at FROM messages WHERE feedback_id IN (${members}) ORDER BY created_at, id`).bind(fb.id).all();
      const first = notes[0] ?? fb;
      const messages = [...notes.slice(1).map((n) => ({ author: "visitor", text: n.text, created_at: n.created_at })), ...(results || [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      return reply({ ok: true, topic: first.topic, text: first.text, created_at: first.created_at, status: fb.status, messages });
    }
    if (request.method !== "POST") return reply({ ok: false }, 405);

    // ---- מונה כניסות: רק עמודים מוכרים, ונשמר רק המספר ליום ולעמוד
    if (url.pathname === "/hit") {
      let page = "";
      let v = "";
      try {
        const b = await request.json();
        page = String(b.page || "");
        v = String(b.v || "");
      } catch {
        return reply({ ok: false }, 400);
      }
      if (!HIT_PAGES.has(page)) return reply({ ok: false }, 400);
      const day = new Date().toISOString().slice(0, 10);
      const vid = await dayKey(`${request.headers.get("cf-connecting-ip") || "unknown"}|${request.headers.get("user-agent") || ""}`);
      const stmts = [
        env.DB.prepare("INSERT INTO hits (day, page, count) VALUES (?, ?, 1) ON CONFLICT(day, page) DO UPDATE SET count = count + 1").bind(day, page),
        env.DB.prepare("INSERT OR IGNORE INTO visitors (day, vid, page) VALUES (?, ?, ?)").bind(day, vid, page),
      ];
      if (/^[A-Za-z0-9_-]{16,32}$/.test(v)) {
        const vh = (await sha256(`${v}|elections26-v`)).slice(0, 24);
        stmts.push(
          env.DB.prepare("INSERT INTO visitors_all (vh, first_day, last_day) VALUES (?, ?, ?) ON CONFLICT(vh) DO UPDATE SET last_day = excluded.last_day")
            .bind(vh, day, day),
        );
      }
      await env.DB.batch(stmts);
      return reply({ ok: true });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return reply({ ok: false, error: "bad json" }, 400);
    }
    if (body.website) return reply({ ok: true }); // מלכודת
    // כל אסימון מוכיח בעלות בשיחה שלו; אין שימוש ב-IP או בדמיון בטקסט לאיחוד.
    if (url.pathname === "/merge") {
      if (!Array.isArray(body.tokens) || body.tokens.length < 2 || body.tokens.length > 20 || body.tokens.some((t) => typeof t !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(t)))
        return reply({ ok: false, error: "bad tokens" }, 400);
      const tokens = [...new Set(body.tokens)];
      const hashes = await Promise.all(tokens.map(sha256));
      const placeholders = hashes.map(() => "?").join(",");
      const found = await env.DB.prepare(`SELECT id FROM feedback WHERE token_hash IN (${placeholders})`).bind(...hashes).all();
      if (found.results.length !== hashes.length) return reply({ ok: false, error: "not found" }, 404);
      // הפתרון של הקבוצות נעשה בתוך האצווה האטומית, גם כששתי בקשות איחוד חופפות.
      const roots = `SELECT ft.root_id FROM feedback_threads ft JOIN feedback f ON f.id = ft.feedback_id WHERE f.token_hash IN (${placeholders})`;
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO feedback_threads (feedback_id, root_id) SELECT id, id FROM feedback WHERE token_hash IN (${placeholders})`).bind(...hashes),
        env.DB.prepare(`UPDATE feedback SET status = CASE WHEN EXISTS (SELECT 1 FROM feedback WHERE id IN (${roots}) AND status = 'new') THEN 'new' WHEN NOT EXISTS (SELECT 1 FROM feedback WHERE id IN (${roots}) AND status != 'closed') THEN 'closed' ELSE 'answered' END WHERE id = (SELECT MIN(root_id) FROM (${roots}))`).bind(...hashes, ...hashes, ...hashes),
        env.DB.prepare(`UPDATE feedback_threads SET root_id = (SELECT MIN(root_id) FROM (${roots})) WHERE root_id IN (${roots})`).bind(...hashes, ...hashes),
      ]);
      return reply({ ok: true, token: tokens[0] });
    }
    const note = String(body.text || "").trim().slice(0, MAX_TEXT);
    if (!note) return reply({ ok: false, error: "empty" }, 400);
    // הלוג נפרד ממגבלת ההערה: אין חיתוך שקט של פרטי התקלה.
    if (body.diagnostic !== undefined && (typeof body.diagnostic !== "string" || body.diagnostic.length > 16000))
      return reply({ ok: false, error: "diagnostic too large" }, 413);
    const text = body.diagnostic ? `${note}\n\n--- לוג התקלה ---\n${body.diagnostic}` : note;
    const key = await dayKey(request.headers.get("cf-connecting-ip") || "unknown");
    const now = new Date().toISOString();

    // ---- הערה חדשה זהה שכבר נשלחה היום מאותו מקור: מחזירים "הצלחה" בלי לשמור (הגולש כבר קיבל קישור על הראשונה)
    if (url.pathname !== "/thread") {
      const dup = await env.DB.prepare("SELECT 1 AS d FROM feedback WHERE day_key = ? AND text = ? LIMIT 1").bind(key, text).first();
      if (dup) return reply({ ok: true, duplicate: true });
    }
    if ((await sentToday(env, key)) >= MAX_PER_DAY) return reply({ ok: false, error: "rate" }, 429);

    // ---- תגובת הגולש בשיחה
    if (url.pathname === "/thread") {
      const fb = await findThread(env, body.t);
      if (!fb) return reply({ ok: false, error: "not found" }, 404);
      // אותה תגובה בדיוק כמו האחרונה של הגולש בשיחה: לא נשמרת שוב
      const last = await env.DB.prepare("SELECT text FROM messages WHERE feedback_id = ? AND author = 'visitor' ORDER BY id DESC LIMIT 1").bind(fb.id).first();
      if ((last?.text ?? fb.text) === text) return reply({ ok: true, duplicate: true });
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
