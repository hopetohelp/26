/**
 * שרת הפידבק: POST עם {topic, text, page, theme, website} ⇐ שורה במאגר D1.
 * - בלי מייל, בלי חשבון, ובלי שמירת IP: להגבלת קצב נשמר רק גיבוב של ה-IP עם מלח יומי.
 * - "website" הוא שדה מלכודת שגולש אמיתי לא רואה; מילוי שלו = רובוט, ומחזירים "הצלחה" בלי לשמור.
 * - עד 8 הערות ביום מאותו מקור; טקסט עד 2,000 תווים.
 */
const TOPICS = new Set(["data", "idea", "design", "other"]);
const MAX_TEXT = 2000;
const MAX_PER_DAY = 8;

function cors(env, origin) {
  const allowed = origin === env.ALLOWED_ORIGIN || /^http:\/\/localhost:\d+$/.test(origin || "");
  return {
    "access-control-allow-origin": allowed ? origin : env.ALLOWED_ORIGIN,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

async function dayKey(ip) {
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${day}|${ip}|elections26`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    const headers = { ...cors(env, origin), "content-type": "application/json; charset=utf-8" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return new Response(JSON.stringify({ ok: false }), { status: 405, headers });

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "bad json" }), { status: 400, headers });
    }
    if (body.website) return new Response(JSON.stringify({ ok: true }), { status: 200, headers }); // מלכודת
    const text = String(body.text || "").trim().slice(0, MAX_TEXT);
    const topic = TOPICS.has(body.topic) ? body.topic : "other";
    if (!text) return new Response(JSON.stringify({ ok: false, error: "empty" }), { status: 400, headers });

    const key = await dayKey(request.headers.get("cf-connecting-ip") || "unknown");
    const day = new Date().toISOString().slice(0, 10);
    const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE day_key = ? AND created_at >= ?").bind(key, day).all();
    if ((results?.[0]?.n ?? 0) >= MAX_PER_DAY) return new Response(JSON.stringify({ ok: false, error: "rate" }), { status: 429, headers });

    await env.DB.prepare("INSERT INTO feedback (created_at, topic, text, page, theme, day_key) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(new Date().toISOString(), topic, text, String(body.page || "").slice(0, 120), String(body.theme || "").slice(0, 20), key)
      .run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  },
};
