/**
 * כניסה עם Google: אימות ID token (JWT חתום RS256) מול המפתחות הציבוריים של Google.
 * בודקים חתימה, aud = מזהה הלקוח שלנו, iss של Google ותוקף. מחזירים רק את sub (מזהה קבוע ואטום של החשבון) —
 * המייל והשם מגוגל אינם נקראים ואינם נשמרים (הכרעת בעלים 6.10.2026: בלי מייל).
 */
const CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
let cache = { at: 0, keys: null };

const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64u(s)));

/** env.GOOGLE_JWKS (בדיקות בלבד) עוקף את הבאת המפתחות */
async function keys(env, now) {
  if (env.GOOGLE_JWKS) return env.GOOGLE_JWKS;
  if (!cache.keys || now - cache.at > 3600_000) {
    const r = await fetch(CERTS);
    if (!r.ok) throw new Error("google certs");
    cache = { at: now, keys: (await r.json()).keys || [] };
  }
  return cache.keys;
}

/** ⇐ sub, או null כשהאסימון אינו תקף */
export async function verifyGoogle(env, credential, now) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const parts = typeof credential === "string" ? credential.split(".") : [];
  if (!clientId || parts.length !== 3 || credential.length > 4096) return null;
  let header, payload;
  try {
    header = json(parts[0]);
    payload = json(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const jwk = (await keys(env, now)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;
  if (payload.aud !== clientId || !ISSUERS.has(payload.iss)) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 < now - 60_000) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  return payload.sub;
}
