/**
 * שרת ה-MCP של האתר (elections26-mcp) — הכרעת בעלים 12.10.2026. מדריך: worker/mcp/README.md.
 *
 * שתי כתובות:
 *   /public — בלי התחברות: כל הנתונים הציבוריים (קובצי הנתונים הפתוחים) ומחשבון המנדטים.
 *   /mcp    — עם התחברות לחשבון האתר (OAuth, lib/oauth.js): גם הנתונים והפעולות של המשתמש עצמו, ולמנהל — מסך הניהול.
 * כל נתון אישי וכל פעולה עוברים לשרת ההשתתפות עם כניסת העוזר של המשתמש — אותן הרשאות בדיוק, ומה שמותר לעוזר נקבע שם
 * (worker/crowd/lib/agent.js).
 */
import { OAuthError, approve, authServerMetadata, cleanupOAuth, deny, dropGrant, exchangeToken, issuer, registerClient, requestInfo, resolveAccess, resourceMetadata, startAuthorize } from "./lib/oauth.js";
import { AuthLost, handleRpc } from "./lib/rpc.js";
import { ToolError } from "./lib/tools.js";
import { siteJson } from "./lib/site.js";
import { LIMITS, allow, cleanupLimits, logUse, publicKey, userKey } from "./lib/limits.js";

const MAX_BODY = 256 * 1024;
const clock = (env) => (env.NOW ? env.NOW() : Date.now());

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

/** CORS: נתיבי האישור — רק מהאתר; כל השאר (MCP, OAuth) — לכל לקוח, בלי עוגיות */
function cors(env, request, path) {
  const origin = request.headers.get("origin") || "";
  if (path.startsWith("/authorize/")) {
    const ok = origin === env.ALLOWED_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin);
    return { "access-control-allow-origin": ok ? origin : env.ALLOWED_ORIGIN, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
  }
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
    "access-control-expose-headers": "www-authenticate, mcp-session-id",
  };
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new OAuthError(413, "too_large");
  return text;
}

/** פנייה לשרת ההשתתפות בשם המשתמש (או בלי זהות, לנתונים ציבוריים) */
const CROWD_MESSAGES = {
  assistant_not_allowed: "הפעולה הזו אפשרית רק באתר עצמו, לא דרך עוזר.",
  rate: "יותר מדי שמירות בשעה האחרונה. נסו שוב מאוחר יותר.",
  not_manager: "המשתמש אינו מנהל את הקבוצה הזו.",
  not_member: "המשתמש אינו חבר בקבוצה הזו.",
  unauthorized: "אין הרשאה לפעולה הזו.",
  not_found: "לא נמצא.",
  confirm: "חסר אישור המחיקה.",
};
function crowdCaller(env, agent) {
  return async (path, { body, admin = false, anonymous = false } = {}) => {
    const headers = { "content-type": "application/json" };
    if (!anonymous) headers[admin ? "x-admin-key" : "authorization"] = admin ? agent : `Bearer ${agent}`;
    let res;
    try {
      res = await env.CROWD.fetch(new Request("https://crowd.internal" + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    } catch {
      throw new ToolError("unavailable", "שרת החשבונות אינו זמין כרגע. נסו שוב בעוד רגע.");
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401 && !anonymous && !admin) throw new AuthLost();
    if (!res.ok) {
      const code = data?.error ?? `http_${res.status}`;
      throw new ToolError(code, CROWD_MESSAGES[code] ?? `השרת דחה את הבקשה (${code}).`);
    }
    return data;
  };
}

function unauthorized(env, why = "invalid_token") {
  return json({ error: why }, 401, { "www-authenticate": `Bearer realm="elections26", error="${why}", resource_metadata="${issuer(env)}/.well-known/oauth-protected-resource/mcp"` });
}

async function handleMcp(request, env, mode, now, baseHeaders) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { ...baseHeaders, allow: "POST" });
  let grant = null;
  if (mode === "user") {
    const m = /^Bearer\s+([\w-]{20,100})$/i.exec((request.headers.get("authorization") || "").trim());
    grant = m ? await resolveAccess(env, m[1], now) : null;
    if (!grant) return unauthorized(env);
  }
  let msg;
  try { msg = JSON.parse(await readBody(request)); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, baseHeaders); }
  const calls = (Array.isArray(msg) ? msg : [msg]).filter((m) => m?.method === "tools/call").length;
  if (calls) {
    const key = mode === "user" ? await userKey(grant.grantId) : await publicKey(env, request);
    for (let i = 0; i < calls; i++) if (!(await allow(env, key, LIMITS[mode], now))) return json({ jsonrpc: "2.0", id: Array.isArray(msg) ? null : msg.id ?? null, error: { code: -32000, message: "יותר מדי קריאות בשעה האחרונה. נסו שוב מאוחר יותר." } }, 429, { ...baseHeaders, "retry-after": "600" });
  }
  const crowd = crowdCaller(env, grant?.agent);
  let me = null;
  const ctx = {
    env,
    now,
    mode,
    site: (path) => siteJson(env, path, now),
    crowd,
    me: async () => (me ??= await crowd("/me")),
    log: (tool, outcome) => logUse(env, { tool, mode, client: grant?.clientName ?? "ציבורי", outcome }, now),
  };
  try {
    const out = Array.isArray(msg) ? (await Promise.all(msg.map((m) => handleRpc(m, ctx)))).filter(Boolean) : await handleRpc(msg, ctx);
    if (out === null || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202, headers: baseHeaders });
    return json(out, 200, baseHeaders);
  } catch (e) {
    if (e instanceof AuthLost) {
      await dropGrant(env, grant.grantId);
      return unauthorized(env, "invalid_token");
    }
    console.error(e);
    return json({ jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32603, message: "Internal error" } }, 500, baseHeaders);
  }
}

function errorPage(message, status) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(`<!DOCTYPE html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>חיבור עוזר AI</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.6"><h1 style="font-size:1.5rem">החיבור לא הצליח</h1><p>${esc(message)}</p><p><a href="https://hopetohelp.github.io/26/">חזרה לאתר</a></p></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const headers = cors(env, request, path);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-max-age": "86400" } });
    const now = clock(env);
    try {
      if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration") return json(authServerMetadata(env), 200, headers);
      if (path.startsWith("/.well-known/oauth-protected-resource")) return json(resourceMetadata(env), 200, headers);
      if (path === "/mcp") return handleMcp(request, env, "user", now, headers);
      if (path === "/public") return handleMcp(request, env, "public", now, headers);
      if (path === "/register" && request.method === "POST") {
        if (!(await allow(env, "reg:" + (await publicKey(env, request)), 30, now))) throw new OAuthError(429, "rate");
        return json(await registerClient(env, JSON.parse((await readBody(request)) || "{}"), now), 201, headers);
      }
      if (path === "/authorize" && request.method === "GET") {
        try {
          const { redirect } = await startAuthorize(env, url.searchParams, now);
          return Response.redirect(redirect, 302);
        } catch (e) {
          if (e instanceof OAuthError) return errorPage(e.description || e.code, e.status);
          throw e;
        }
      }
      if (path === "/authorize/info" && request.method === "GET") return json(await requestInfo(env, url.searchParams.get("r"), now), 200, headers);
      if (path === "/authorize/approve" && request.method === "POST") {
        const body = JSON.parse((await readBody(request)) || "{}");
        const check = async (agent) => (await env.CROWD.fetch(new Request("https://crowd.internal/me", { headers: { authorization: `Bearer ${agent}` } }))).ok;
        return json(await approve(env, body, now, check), 200, headers);
      }
      if (path === "/authorize/deny" && request.method === "POST") return json(await deny(env, JSON.parse((await readBody(request)) || "{}"), now), 200, headers);
      if (path === "/token" && request.method === "POST") {
        const text = await readBody(request);
        const form = (request.headers.get("content-type") || "").includes("json") ? new URLSearchParams(Object.entries(JSON.parse(text || "{}"))) : new URLSearchParams(text);
        return json(await exchangeToken(env, form, now), 200, headers);
      }
      if (path === "/" && request.method === "GET")
        return json({ name: "בחירות 2026 — ניתוח · שרת MCP", public: `${issuer(env)}/public`, withLogin: `${issuer(env)}/mcp`, docs: `${env.SITE_URL}llms.txt` }, 200, headers);
      return json({ error: "not_found" }, 404, headers);
    } catch (e) {
      if (e instanceof OAuthError) return json({ error: e.code, ...(e.description ? { error_description: e.description } : {}) }, e.status, headers);
      if (e instanceof SyntaxError) return json({ error: "invalid_request", error_description: "JSON שבור" }, 400, headers);
      console.error(e);
      return json({ error: "server_error" }, 500, headers);
    }
  },

  async scheduled(_event, env, ctx) {
    const now = clock(env);
    ctx.waitUntil(Promise.all([cleanupOAuth(env, now), cleanupLimits(env, now)]));
  },
};
