/**
 * שרת הפידבק (Cloudflare Worker + D1). בלי מייל, בלי חשבון, ובלי שמירת IP.
 *
 * POST /            {topic, text, page, theme, website} ⇐ הערה חדשה. מחזיר {ok, token}: הקישור האישי של הגולש.
 * GET  /thread?t=   ⇐ ההערה והשיחה עליה (רק למי שמחזיק את הקישור).
 * POST /thread      {t, text, website} ⇐ תגובה של הגולש בשיחה.
 * POST /merge       {tokens} ⇐ איחוד השיחות שהגולש מחזיק בכל הקישורים שלהן. הקישורים נשארים תקפים.
 * GET|POST /ping   ⇐ בדיקת חיבור, בלי מאגר.
 * POST /relay      {d}   ⇐ ממסר שמירה כשהמסלולים הרגילים חסומים: מעביר לשרת ההשתתפות את הבקשה המקודדת ב-d.
 * POST /autoreport {log} ⇐ דיווח כשל חיבור אוטומטי (בלי אישור הגולש), עד 3 ליום מכל מקור.
 * POST /diag        {kind} ⇐ סיווג כשל חיבור (מונה ליום; hits.page = diag:<kind>).
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
/** סיווגי "בדיקת חיבור" שהדפדפן שולח אחרי כשל (POST /diag): רק מונה ליום, בלי שום פרט על המשתמש. נשמרים ב-hits בשם diag:<סיווג>. */
/** דיווח כשל חיבור אוטומטי (POST /autoreport, בלי אישור הגולש — הכרעת בעלים 8.10.2026): נשמר כהערה עם התחילית הזו, עד 3 ליום מכל מקור, ולא נספר במכסת ההערות. */
const AUTO = "[כשל חיבור אוטומטי]";
const AUTO_PER_DAY = 3;
const DIAG_KINDS = new Set(["all-ok", "all-blocked", "feedback-only", "direct-only", "gateway-only", "post-blocked", "password-blocked", "fallback-saved", "relay-saved", "blind-sent"]);
/** בדיקת עומק אחרי חסימה: לאן כן מגיעים (probe-<יעד>-<תוצאה>) — מונה ליום בלבד */
const PROBE_KIND = /^probe-(worker|crowd|site|gapi|gsi)-(ok|fail)$/;
/** נתיבי שרת ההשתתפות שמותר להעביר דרך הממסר (POST /relay) */
const RELAY_PATHS = new Set(["/dashboard", "/log", "/save", "/me", "/history", "/export", "/delete", "/link/rotate", "/auth/register", "/auth/guest", "/auth/claim", "/auth/google", "/prefs", "/auth/login", "/auth/logout", "/auth/password", "/auth/link", "/auth/recover", "/support"]);
const HIT_PAGES = new Set(["/", "/today", "/polls", "/changes", "/calculator", "/past", "/method", "/thread", "/guess", "/community"]);

function cors(env, origin) {
  const allowed = origin === env.ALLOWED_ORIGIN || /^http:\/\/localhost:\d+$/.test(origin || "");
  return {
    "access-control-allow-origin": allowed ? origin : env.ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

// גיבוב חתום (HMAC) עם סוד השרת IP_KEY: בלי הסוד אי אפשר לנחש את הכתובת בניסוי כל הכתובות האפשריות.
// בלי הסוד (פריסה ראשונה, בדיקות) — הגיבוב הישן.
async function dayKey(env, ip) {
  const day = new Date().toISOString().slice(0, 10);
  if (!env?.IP_KEY) return (await sha256(`${day}|${ip}|elections26`)).slice(0, 24);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.IP_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${day}|${ip}`))).slice(0, 24);
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** הודעות היום מאותו מקור — הערות ותגובות יחד */
async function sentToday(env, key) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM feedback WHERE day_key = ?1 AND created_at >= ?2 AND text NOT LIKE ?3) + (SELECT COUNT(*) FROM messages WHERE day_key = ?1 AND created_at >= ?2) AS n",
  ).bind(key, day, AUTO + "%").first();
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

/** העתקה חוזרת בטוחה: ההודעות המקוריות נשמרות, וסטטוס מקומי חדש יותר אינו נדרס. */
async function importSupport(env, participant, thread) {
  if (!thread) return;
  await env.DB.prepare("INSERT OR IGNORE INTO support_threads (participant, created_at, updated_at, status) VALUES (?, ?, ?, ?)").bind(participant, thread.created_at, thread.updated_at, thread.status).run();
  const statements = [];
  for (const [index, message] of (thread.messages || []).entries()) {
    const key = await sha256(JSON.stringify([participant, index, message.created_at, message.author, message.text]));
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO support_messages (participant, created_at, author, text, legacy_key) VALUES (?, ?, ?, ?, ?)").bind(participant, message.created_at, message.author, message.text, key));
  }
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
  await env.DB.prepare("UPDATE support_threads SET updated_at = ?, status = ? WHERE participant = ? AND updated_at < ?").bind(thread.updated_at, thread.status, participant, thread.updated_at).run();
}

async function supportThread(env, participant) {
  const thread = await env.DB.prepare("SELECT status, created_at, updated_at FROM support_threads WHERE participant = ?").bind(participant).first();
  if (!thread) return null;
  const { results } = await env.DB.prepare("SELECT author, text, created_at FROM support_messages WHERE participant = ? ORDER BY created_at, id").bind(participant).all();
  return { ...thread, messages: results || [] };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    const headers = { ...cors(env, origin), "content-type": "application/json; charset=utf-8" };
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);

    // Keep the original authentication, origin and client-IP headers across the internal service binding.
    if (url.pathname.startsWith("/crowd/")) {
      if (!env.CROWD) return reply({ error: "offline" }, 503);
      url.pathname = url.pathname.slice("/crowd".length);
      return env.CROWD.fetch(new Request(url, request));
    }

    // אותה כתובת ואותה צורת בקשה כמו הערה רגילה, בלי כותרת זהות בדפדפן.
    let accountBody;
    if (url.pathname === "/" && request.method === "POST") {
      const candidate = await request.clone().json().catch(() => null);
      if (candidate?.kind === "account-support") accountBody = candidate;
    }
    // הסשן מאומת רק בבקשה פנימית, ואינו נשמר במאגר ההערות.
    if ((url.pathname === "/support" || accountBody) && request.method === "POST") {
      let body;
      try { body = accountBody ?? await request.json(); } catch { return reply({ error: "bad_json" }, 400); }
      if (!body || typeof body.token !== "string" || !body.token || body.token.length > 256) return reply({ error: "unauthorized" }, 401);
      if (!env.CROWD) return reply({ error: "offline" }, 503);
      const authHeaders = { authorization: `Bearer ${body.token}`, origin: origin || "" };
      let access;
      try {
        let auth = await env.CROWD.fetch(new Request("https://crowd.internal/support/access", { headers: authHeaders }));
        if (auth.status === 404) {
          // פריסת שרת ההערות יכולה להקדים את שרת החשבונות.
          const me = await env.CROWD.fetch(new Request("https://crowd.internal/me", { headers: authHeaders }));
          if (!me.ok) return reply({ error: me.status === 401 ? "unauthorized" : "account_unavailable" }, me.status);
          const owner = await me.json();
          auth = await env.CROWD.fetch(new Request("https://crowd.internal/support", { headers: authHeaders }));
          if (!auth.ok) return reply({ error: "account_unavailable" }, 503);
          access = { participant: owner.participant, ...(await auth.json()) };
        } else {
          if (!auth.ok) return reply({ error: auth.status === 401 ? "unauthorized" : "account_unavailable" }, auth.status);
          access = await auth.json();
        }
      } catch { return reply({ error: "account_unavailable" }, 503); }
      if (typeof access.participant !== "string" || !access.participant) return reply({ error: "account_unavailable" }, 503);
      const participant = access.participant;
      await importSupport(env, participant, access.thread);
      if (body.text !== undefined) {
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text || text.length > MAX_TEXT || typeof body.op_id !== "string" || !/^[\w-]{16,64}$/.test(body.op_id)) return reply({ error: "bad_request" }, 400);
        if (body.website) return reply({ ok: true });
        const at = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare("INSERT OR IGNORE INTO support_threads (participant, created_at, updated_at, status) VALUES (?, ?, ?, 'new')").bind(participant, at, at),
          env.DB.prepare("INSERT OR IGNORE INTO support_messages (participant, created_at, author, text, op_id) VALUES (?, ?, 'visitor', ?, ?)").bind(participant, at, text, body.op_id),
          env.DB.prepare("UPDATE support_threads SET updated_at = ?, status = 'new' WHERE participant = ? AND changes() = 1").bind(at, participant),
        ]);
      }
      return reply({ ok: true, thread: await supportThread(env, participant) });
    }

    // ---- ממשק ניהול: מפתח ב-Authorization: Bearer; במאגר רק הגיבוב שלו (admin_keys). שיחות תמיכה, תשובות ומספרים.
    if (url.pathname.startsWith("/admin/")) {
      const key = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
      const ok = key.length >= 32 && (await env.DB.prepare("SELECT 1 AS x FROM admin_keys WHERE hash = ?").bind(await sha256(key)).first());
      if (!ok) return reply({ ok: false, error: "unauthorized" }, 401);
      const crowd = (path, init = {}) => env.CROWD ? env.CROWD.fetch(new Request("https://crowd.internal" + path, { ...init, headers: { "x-admin-key": key, "content-type": "application/json" } })).then((r) => r.json()).catch(() => null) : Promise.resolve(null);
      if (request.method === "GET" && url.pathname === "/admin/data") {
        const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
        const { results: notes } = await env.DB.prepare("SELECT f.id, f.created_at, f.topic, f.text, f.page, f.status, COALESCE(ft.root_id, f.id) AS root FROM feedback f LEFT JOIN feedback_threads ft ON ft.feedback_id = f.id WHERE f.text NOT LIKE ?1 ORDER BY f.created_at DESC LIMIT 300").bind(AUTO + "%").all();
        const { results: msgs } = await env.DB.prepare("SELECT feedback_id, author, text, created_at FROM messages WHERE feedback_id IN (SELECT id FROM feedback WHERE text NOT LIKE ?1 ORDER BY created_at DESC LIMIT 300) ORDER BY created_at, id").bind(AUTO + "%").all();
        const { results: days } = await env.DB.prepare("SELECT d.day, (SELECT COALESCE(SUM(count),0) FROM hits h WHERE h.day = d.day AND h.page NOT LIKE 'diag:%') AS visits, (SELECT COUNT(DISTINCT vid) FROM visitors v WHERE v.day = d.day) AS users, (SELECT COUNT(DISTINCT vid) FROM visitors v WHERE v.day = d.day AND v.page = '/guess') AS guessUsers, (SELECT COUNT(DISTINCT vid) FROM visitors v WHERE v.day = d.day AND v.page = '/community') AS communityUsers, (SELECT COALESCE(SUM(count),0) FROM hits h WHERE h.day = d.day AND h.page = 'diag:all-blocked') AS blocked, (SELECT COALESCE(SUM(count),0) FROM hits h WHERE h.day = d.day AND h.page = 'diag:blind-sent') AS blindSaved, (SELECT COALESCE(SUM(count),0) FROM hits h WHERE h.day = d.day AND h.page = 'diag:relay-saved') AS relaySaved, (SELECT COUNT(*) FROM feedback f WHERE substr(f.created_at,1,10) = d.day AND f.text LIKE ?2) AS autoFailures FROM (SELECT DISTINCT day FROM hits WHERE day >= ?1) d ORDER BY d.day DESC").bind(since, AUTO + "%").all();
        const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM visitors_all").first();
        const threads = {};
        for (const n of notes || []) (threads[n.root] ??= { id: n.root, items: [] }).items.push({ kind: "note", id: n.id, author: "visitor", text: n.text, created_at: n.created_at, topic: n.topic, page: n.page, status: n.status });
        for (const m of msgs || []) {
          const root = (notes || []).find((n) => n.id === m.feedback_id)?.root ?? m.feedback_id;
          (threads[root] ??= { id: root, items: [] }).items.push({ kind: "message", author: m.author, text: m.text, created_at: m.created_at });
        }
        const list = Object.values(threads).map((t) => {
          t.items.sort((a, b) => a.created_at.localeCompare(b.created_at));
          const last = t.items[t.items.length - 1];
          return { ...t, updated_at: last.created_at, waiting: last.author === "visitor" };
        }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        const legacy = await crowd("/admin/support");
        for (const thread of legacy?.threads || []) await importSupport(env, thread.participant, thread);
        const { results: accountThreads } = await env.DB.prepare("SELECT participant, status, created_at, updated_at FROM support_threads ORDER BY updated_at DESC").all();
        const local = [];
        for (const thread of accountThreads || []) local.push({ participant: thread.participant, ...(await supportThread(env, thread.participant)) });
        return reply({ ok: true, days: days || [], totalVisitors: total?.n ?? 0, feedback: list, support: { stats: legacy?.stats ?? {}, threads: local }, accountStatsAvailable: !!legacy?.stats });
      }
      if (request.method === "POST" && url.pathname === "/admin/reply") {
        let b = {};
        try { b = await request.json(); } catch { return reply({ ok: false }, 400); }
        const text = String(b.text || "").trim().slice(0, 4000);
        if (!text) return reply({ ok: false, error: "empty" }, 400);
        if (b.kind === "support") {
          const participant = String(b.id || "");
          const thread = await supportThread(env, participant);
          if (!thread) return reply({ ok: false, error: "not found" }, 404);
          const at = new Date().toISOString();
          await env.DB.batch([
            env.DB.prepare("INSERT INTO support_messages (participant, created_at, author, text) VALUES (?, ?, 'team', ?)").bind(participant, at, text),
            env.DB.prepare("UPDATE support_threads SET updated_at = ?, status = 'answered' WHERE participant = ?").bind(at, participant),
          ]);
          return reply({ ok: true });
        }
        const id = Number(b.id);
        if (!Number.isInteger(id)) return reply({ ok: false }, 400);
        const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO messages (feedback_id, created_at, author, text) SELECT ?, ?, 'team', ? WHERE EXISTS (SELECT 1 FROM feedback WHERE id = ?)").bind(id, now, text, id),
          env.DB.prepare("UPDATE feedback SET status = 'answered' WHERE id = ? OR id IN (SELECT feedback_id FROM feedback_threads WHERE root_id = ?)").bind(id, id),
        ]);
        return reply({ ok: true });
      }
      return reply({ ok: false }, 404);
    }

    // ---- בדיקת חיבור (בלי מאגר)
    if (url.pathname === "/ping") return reply({ ok: true });

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

    // ---- סיווג כשל חיבור: מונה בלבד
    if (url.pathname === "/diag") {
      let kind = "";
      try {
        kind = String((await request.json()).kind || "");
      } catch {
        return reply({ ok: false }, 400);
      }
      if (!DIAG_KINDS.has(kind) && !PROBE_KIND.test(kind)) return reply({ ok: false }, 400);
      const day = new Date().toISOString().slice(0, 10);
      await env.DB.prepare("INSERT INTO hits (day, page, count) VALUES (?, ?, 1) ON CONFLICT(day, page) DO UPDATE SET count = count + 1").bind(day, "diag:" + kind).run();
      return reply({ ok: true });
    }

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
      const vid = await dayKey(env, `${request.headers.get("cf-connecting-ip") || "unknown"}|${request.headers.get("user-agent") || ""}`);
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
    // ---- ממסר שמירה: כששני המסלולים לשרת ההשתתפות נכשלו ברשת, הדפדפן שולח את אותה בקשה כאן, באותה צורה כמו דיווח כשל
    //      (הכרעת בעלים 8.10.2026). d = base64 של {path, method, token, body}; מועבר לשרת ההשתתפות כבקשה רגילה, עם אותם כללים.
    if (url.pathname === "/relay") {
      if (!env.CROWD) return reply({ error: "offline" }, 503);
      let r;
      try {
        r = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(String(body.d || "")), (c) => c.charCodeAt(0))));
      } catch {
        return reply({ error: "bad relay" }, 400);
      }
      if (typeof r.path !== "string" || !RELAY_PATHS.has(r.path.split("?")[0]) || !["GET", "POST"].includes(r.method)) return reply({ error: "bad relay" }, 400);
      const headers = { "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "", origin: request.headers.get("origin") || "" };
      if (typeof r.token === "string" && r.token) headers.authorization = `Bearer ${r.token}`;
      if (r.body !== undefined) headers["content-type"] = "application/json";
      const res = await env.CROWD.fetch(new Request(new URL(r.path, "https://crowd.internal"), { method: r.method, headers, body: r.body === undefined ? undefined : JSON.stringify(r.body) }));
      return new Response(await res.text(), { status: res.status, headers: { ...cors(env, request.headers.get("origin")), "content-type": "application/json" } });
    }
    // ---- דיווח כשל חיבור אוטומטי: לוג טכני בלבד (הדפדפן כבר הסיר אסימונים, סיסמאות וכתובות אישיות)
    if (url.pathname === "/autoreport") {
      const log = typeof body.log === "string" ? body.log.slice(0, 16000) : "";
      if (!log) return reply({ ok: false, error: "empty" }, 400);
      const akey = await dayKey(env, request.headers.get("cf-connecting-ip") || "unknown");
      const day = new Date().toISOString().slice(0, 10);
      const sent = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE day_key = ? AND created_at >= ? AND text LIKE ?").bind(akey, day, AUTO + "%").first();
      if ((sent?.n ?? 0) >= AUTO_PER_DAY) return reply({ ok: true, dropped: true });
      await env.DB.prepare("INSERT INTO feedback (created_at, topic, text, page, theme, day_key, token_hash, status) VALUES (?, 'other', ?, 'auto', '', ?, ?, 'new')")
        .bind(new Date().toISOString(), `${AUTO}\n${log}`, akey, await sha256(newToken()))
        .run();
      return reply({ ok: true });
    }
    const note = String(body.text || "").trim().slice(0, MAX_TEXT);
    if (!note) return reply({ ok: false, error: "empty" }, 400);
    // הלוג נפרד ממגבלת ההערה: אין חיתוך שקט של פרטי התקלה.
    if (body.diagnostic !== undefined && (typeof body.diagnostic !== "string" || body.diagnostic.length > 16000))
      return reply({ ok: false, error: "diagnostic too large" }, 413);
    const text = body.diagnostic ? `${note}\n\n--- לוג התקלה ---\n${body.diagnostic}` : note;
    const key = await dayKey(env, request.headers.get("cf-connecting-ip") || "unknown");
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
