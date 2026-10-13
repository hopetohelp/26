/**
 * התחברות עוזר AI לחשבון האתר — OAuth 2.1 עם PKCE והרשמה דינמית (כמו שמחברים של Claude ו-ChatGPT מצפים).
 *
 * הזרימה (הכרעת בעלים 12.10.2026):
 * 1. העוזר נרשם (`POST /register`) ופותח לגולש את `GET /authorize`.
 * 2. השרת שומר את הבקשה ומעביר את הגולש למסך "חיבור עוזר AI" **באתר עצמו** (`#/connect?r=…`) — שם הוא מחובר כרגיל,
 *    רואה לאיזה חשבון ומי מבקש, ולוחץ "אישור".
 * 3. המסך מבקש משרת ההשתתפות כניסת עוזר נפרדת (`POST /auth/delegate`) ושולח אותה לכאן (`POST /authorize/approve`).
 *    סשן הדפדפן עצמו לא מגיע לשרת הזה לעולם.
 * 4. השרת מחזיר את הגולש לעוזר עם קוד חד-פעמי, והעוזר מחליף אותו באסימון (`POST /token`, בדיקת PKCE).
 *
 * 🔴 העוזר אינו מקבל את כניסת העוזר של שרת ההשתתפות — רק אסימון של השרת הזה. הכניסה עצמה נשמרת כאן מוצפנת (DATA_KEY),
 * וכל מה שהיא רשאית נקבע בשרת ההשתתפות (worker/crowd/lib/agent.js), לא כאן.
 * 🔴 הרשמה דינמית פתוחה: רישום לבדו אינו נותן שום גישה — רק אישור המשתמש במסך באתר.
 */
import { randomToken, sha256, b64url } from "../../crowd/lib/crypto.js";
import { seal, open } from "../../crowd/lib/identity.js";

export const ACCESS_TTL = 3600 * 1000;
export const REQUEST_TTL = 10 * 60 * 1000;
export const CODE_TTL = 5 * 60 * 1000;
/** חיבור שלא היה בו שימוש כל הזמן הזה — מתנתק לבד (אותו משך כמו AGENT_SESSION_MS בשרת ההשתתפות); כל שימוש מאריך */
export const AGENT_FALLBACK_MS = 30 * 24 * 3600 * 1000;
const RENEW_MS = 24 * 3600 * 1000;
const MAX_REDIRECTS = 5;

export class OAuthError extends Error {
  constructor(status, code, description) {
    super(description || code);
    this.status = status;
    this.code = code;
    this.description = description;
  }
}

const iso = (t) => new Date(t).toISOString();
const enc = new TextEncoder();

/** PKCE S256: base64url(SHA-256(verifier)) */
export async function pkceChallenge(verifier) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
}

export const issuer = (env) => env.ISSUER.replace(/\/$/, "");

export function authServerMetadata(env) {
  const base = issuer(env);
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["elections26"],
    service_documentation: `${env.SITE_URL}llms.txt`,
  };
}

export function resourceMetadata(env) {
  const base = issuer(env);
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["elections26"],
    resource_name: "בחירות 2026",
    resource_documentation: `${env.SITE_URL}llms.txt`,
  };
}

/** כתובת חזרה מותרת: https, או localhost לעוזר שולחני. בלי חלק אחרי # */
export function validRedirect(u) {
  if (typeof u !== "string" || u.length > 500) return false;
  let url;
  try { url = new URL(u); } catch { return false; }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

const cleanName = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 60) : "") || "עוזר AI";

/** RFC 7591 */
export async function registerClient(env, body, now) {
  const uris = body?.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > MAX_REDIRECTS || !uris.every(validRedirect))
    throw new OAuthError(400, "invalid_redirect_uri", "redirect_uris: https או localhost בלבד");
  const id = randomToken(18);
  const name = cleanName(body.client_name);
  await env.DB.prepare("INSERT INTO clients (id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)").bind(id, name, JSON.stringify(uris), iso(now)).run();
  return {
    client_id: id,
    client_name: name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(now / 1000),
  };
}

export async function getClient(env, id) {
  if (typeof id !== "string" || id.length > 64) return null;
  const row = await env.DB.prepare("SELECT id, name, redirect_uris FROM clients WHERE id = ?").bind(id).first();
  return row ? { id: row.id, name: row.name, redirectUris: JSON.parse(row.redirect_uris) } : null;
}

/**
 * GET /authorize ⇐ {redirect} למסך באתר. שגיאה בלקוח או בכתובת החזרה ⇐ OAuthError (מוצג לגולש, לא מועבר לכתובת לא מאומתת).
 * שגיאה אחרת (בלי PKCE, response_type) ⇐ חזרה לעוזר עם error, כמו בתקן.
 */
export async function startAuthorize(env, params, now) {
  const client = await getClient(env, params.get("client_id"));
  if (!client) throw new OAuthError(400, "invalid_client", "העוזר אינו רשום. נסו להתחבר מחדש מתוך העוזר.");
  const redirect = params.get("redirect_uri") || (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!client.redirectUris.includes(redirect)) throw new OAuthError(400, "invalid_request", "כתובת החזרה אינה של העוזר הרשום.");
  const state = params.get("state");
  const back = (error) => {
    const u = new URL(redirect);
    u.searchParams.set("error", error);
    if (state) u.searchParams.set("state", state);
    return { redirect: u.toString() };
  };
  if (params.get("response_type") !== "code") return back("unsupported_response_type");
  const challenge = params.get("code_challenge");
  if (params.get("code_challenge_method") !== "S256" || !challenge || !/^[\w-]{43,128}$/.test(challenge)) return back("invalid_request");
  const id = randomToken(24);
  await env.DB.prepare("INSERT INTO auth_requests (id_hash, client_id, redirect_uri, challenge, state, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256(id), client.id, redirect, challenge, state ? state.slice(0, 500) : null, now).run();
  return { redirect: `${env.SITE_URL}#/connect?r=${encodeURIComponent(id)}` };
}

async function pendingRequest(env, id, now) {
  if (typeof id !== "string" || !/^[\w-]{20,64}$/.test(id)) throw new OAuthError(400, "invalid_request", "בקשת החיבור אינה תקינה.");
  const row = await env.DB.prepare("SELECT * FROM auth_requests WHERE id_hash = ?").bind(await sha256(id)).first();
  if (!row || row.created_at < now - REQUEST_TTL) throw new OAuthError(410, "expired", "בקשת החיבור פגה. התחילו שוב מתוך העוזר.");
  return row;
}

/** למסך באתר: מי מבקש, ולאן יחזור */
export async function requestInfo(env, id, now) {
  const row = await pendingRequest(env, id, now);
  const client = await getClient(env, row.client_id);
  return { client: client?.name ?? "עוזר AI", returnHost: new URL(row.redirect_uri).host, expiresAt: iso(row.created_at + REQUEST_TTL) };
}

/**
 * POST /authorize/approve {r, agent, expiresAt?} ⇐ {redirect}. `checkAgent(token)` מוודא מול שרת ההשתתפות שהכניסה חיה.
 */
export async function approve(env, body, now, checkAgent) {
  const row = await pendingRequest(env, body?.r, now);
  const agent = body?.agent;
  if (typeof agent !== "string" || !/^[\w-]{20,100}$/.test(agent) || !(await checkAgent(agent))) throw new OAuthError(401, "invalid_agent", "החיבור לא אושר בשרת החשבונות. נסו שוב.");
  const exp = Date.parse(body?.expiresAt ?? "");
  const agentExpires = iso(Number.isFinite(exp) && exp > now ? Math.min(exp, now + AGENT_FALLBACK_MS) : now + AGENT_FALLBACK_MS);
  const code = randomToken(32);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO auth_codes (code_hash, client_id, redirect_uri, challenge, agent_enc, agent_expires, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(await sha256(code), row.client_id, row.redirect_uri, row.challenge, await seal(env, agent), agentExpires, now),
    env.DB.prepare("DELETE FROM auth_requests WHERE id_hash = ?").bind(row.id_hash),
  ]);
  const u = new URL(row.redirect_uri);
  u.searchParams.set("code", code);
  if (row.state) u.searchParams.set("state", row.state);
  return { redirect: u.toString() };
}

/** POST /authorize/deny {r} ⇐ {redirect} עם access_denied */
export async function deny(env, body, now) {
  const row = await pendingRequest(env, body?.r, now);
  await env.DB.prepare("DELETE FROM auth_requests WHERE id_hash = ?").bind(row.id_hash).run();
  const u = new URL(row.redirect_uri);
  u.searchParams.set("error", "access_denied");
  if (row.state) u.searchParams.set("state", row.state);
  return { redirect: u.toString() };
}

async function issueTokens(env, grantId, refreshUntil, now) {
  const access = randomToken(32);
  const refresh = randomToken(32);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, 'access', ?)").bind(await sha256(access), grantId, now + ACCESS_TTL),
    env.DB.prepare("INSERT INTO tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, 'refresh', ?)").bind(await sha256(refresh), grantId, refreshUntil),
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: "elections26" };
}

/** POST /token: authorization_code (עם PKCE) או refresh_token (האסימון מתחלף בכל שימוש) */
export async function exchangeToken(env, form, now) {
  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  if (grantType === "authorization_code") {
    const code = form.get("code") || "";
    const row = await env.DB.prepare("SELECT * FROM auth_codes WHERE code_hash = ?").bind(await sha256(code)).first();
    if (!row) throw new OAuthError(400, "invalid_grant", "הקוד אינו תקף.");
    // קוד חד-פעמי: נמחק לפני כל בדיקה נוספת
    await env.DB.prepare("DELETE FROM auth_codes WHERE code_hash = ?").bind(row.code_hash).run();
    if (row.created_at < now - CODE_TTL) throw new OAuthError(400, "invalid_grant", "הקוד פג.");
    if (clientId && clientId !== row.client_id) throw new OAuthError(400, "invalid_grant", "הקוד שייך לעוזר אחר.");
    if ((form.get("redirect_uri") || row.redirect_uri) !== row.redirect_uri) throw new OAuthError(400, "invalid_grant", "כתובת החזרה שונה.");
    const verifier = form.get("code_verifier") || "";
    if (!/^[\w.~-]{43,128}$/.test(verifier) || (await pkceChallenge(verifier)) !== row.challenge) throw new OAuthError(400, "invalid_grant", "PKCE");
    const grantId = randomToken(18);
    await env.DB.prepare("INSERT INTO grants (id, client_id, agent_enc, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(grantId, row.client_id, row.agent_enc, iso(now), row.agent_expires).run();
    return issueTokens(env, grantId, Date.parse(row.agent_expires), now);
  }
  if (grantType === "refresh_token") {
    const th = await sha256(form.get("refresh_token") || "");
    const tok = await env.DB.prepare("SELECT t.grant_id, t.expires_at, g.client_id, g.expires_at AS grant_expires FROM tokens t JOIN grants g ON g.id = t.grant_id WHERE t.token_hash = ? AND t.kind = 'refresh'").bind(th).first();
    if (!tok || tok.expires_at < now || Date.parse(tok.grant_expires) < now) throw new OAuthError(400, "invalid_grant", "החיבור פג. התחברו מחדש.");
    if (clientId && clientId !== tok.client_id) throw new OAuthError(400, "invalid_grant", "האסימון שייך לעוזר אחר.");
    await env.DB.prepare("DELETE FROM tokens WHERE token_hash = ?").bind(th).run();
    // רענון = שימוש ⇐ החיבור מתארך
    const until = now + AGENT_FALLBACK_MS;
    await env.DB.prepare("UPDATE grants SET expires_at = ? WHERE id = ?").bind(iso(until), tok.grant_id).run();
    return issueTokens(env, tok.grant_id, until, now);
  }
  throw new OAuthError(400, "unsupported_grant_type");
}

/** אסימון גישה ⇐ {grantId, clientName, agent} או null */
export async function resolveAccess(env, token, now) {
  if (!token) return null;
  const row = await env.DB.prepare("SELECT t.grant_id, t.expires_at, g.agent_enc, g.expires_at AS grant_expires, c.name AS client FROM tokens t JOIN grants g ON g.id = t.grant_id LEFT JOIN clients c ON c.id = g.client_id WHERE t.token_hash = ? AND t.kind = 'access'")
    .bind(await sha256(token)).first();
  if (!row || row.expires_at < now || Date.parse(row.grant_expires) < now) return null;
  const agent = await open(env, row.agent_enc);
  if (!agent) return null;
  // החיבור מתארך בכל שימוש (הכרעת בעלים 12.10.2026); נכתב לכל היותר פעם ביום ⇐ renewed: גם הכניסה בשרת ההשתתפות מתארכת
  const renewed = Date.parse(row.grant_expires) < now + AGENT_FALLBACK_MS - RENEW_MS;
  if (renewed) await env.DB.prepare("UPDATE grants SET expires_at = ? WHERE id = ?").bind(iso(now + AGENT_FALLBACK_MS), row.grant_id).run();
  return { grantId: row.grant_id, clientName: row.client ?? "עוזר AI", agent, renewed };
}

/** החיבור נותק באתר (שרת ההשתתפות ענה 401) ⇐ מוחקים את החיבור ואת כל האסימונים שלו */
export async function dropGrant(env, grantId) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tokens WHERE grant_id = ?").bind(grantId),
    env.DB.prepare("DELETE FROM grants WHERE id = ?").bind(grantId),
  ]);
}

export async function cleanupOAuth(env, now) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_requests WHERE created_at < ?").bind(now - REQUEST_TTL),
    env.DB.prepare("DELETE FROM auth_codes WHERE created_at < ?").bind(now - CODE_TTL),
    env.DB.prepare("DELETE FROM tokens WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM tokens WHERE grant_id IN (SELECT id FROM grants WHERE expires_at < ?)").bind(iso(now)),
    env.DB.prepare("DELETE FROM grants WHERE expires_at < ?").bind(iso(now)),
    // לקוח שנרשם ולא חובר תוך 30 יום — נמחק (רישום לבדו אינו נותן כלום)
    env.DB.prepare("DELETE FROM clients WHERE created_at < ? AND id NOT IN (SELECT client_id FROM grants) AND id NOT IN (SELECT client_id FROM auth_requests) AND id NOT IN (SELECT client_id FROM auth_codes)").bind(iso(now - AGENT_FALLBACK_MS)),
  ]);
}
