/**
 * כלי הצפנה וגיבוב — WebCrypto בלבד (זמין גם ב-Worker וגם ב-Node 20+).
 * מפתחות מגיעים מסודות השרת כ-base64 של 32 בתים (openssl rand -base64 32).
 */
const enc = new TextEncoder();

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (buf) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** אסימון אקראי של 256 ביט (ברירת מחדל), בפורמט שמתאים לכתובת */
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

/** סוד ⇐ בתים: base64 תקין באורך 32 בתים, אחרת הטקסט עצמו (סביבת בדיקה) */
function keyBytes(secret) {
  if (!secret) throw new Error("missing secret");
  try {
    const b = unb64(secret);
    if (b.length === 32) return b;
  } catch {
    /* לא base64 */
  }
  return enc.encode(secret);
}

export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** השוואה בזמן קבוע של שתי מחרוזות */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_ALGO = "pbkdf2-sha256";

/** PBKDF2-SHA256 ⇐ hex של 32 בתים */
export async function pbkdf2(password, saltB64, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations }, key, 256);
  return hex(bits);
}

export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { hash: await pbkdf2(password, salt, iterations), salt, iterations, algo: PBKDF2_ALGO };
}

export async function verifyPassword(password, row) {
  if (row.algo !== PBKDF2_ALGO) return false;
  return safeEqual(await pbkdf2(password, row.salt, row.iterations), row.hash);
}

/** כתובת IP לצורך הגבלת קצב: IPv6 נחתך ל-/64 (ארבע הקבוצות הראשונות) */
export function ipPrefix(ip) {
  if (!ip || !ip.includes(":")) return ip || "unknown";
  let [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const full = tail !== undefined ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return full.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(":") + "::/64";
}
