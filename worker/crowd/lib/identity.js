/**
 * מייל ושם (הכרעת בעלים 9.10.2026): חשבון = מייל או Google, ולא יותר מחשבון אחד לכל מייל.
 * - המייל מנורמל (אותיות קטנות; ב-Gmail גם בלי נקודות ובלי +תוספת) ונשמר פעמיים:
 *   גיבוב חתום (HMAC, ייחודי במאגר — לבדיקת כפילות ולכניסה) ומוצפן (AES-GCM — רק כדי להציג לבעל החשבון).
 * - המפתח: הסוד DATA_KEY (נוצר בפריסה). הוא אינו מתחלף, כי בלעדיו אי אפשר לפענח.
 * כך עותק של המאגר לבדו אינו חושף אף מייל או שם.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const EMAIL = /^[^\s@<>()[\]"',;:\\]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,24}$/;
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** ⇐ {display, norm} או null. display = כפי שהוקלד (אותיות קטנות); norm = הצורה לבדיקת כפילות */
export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const display = raw.normalize("NFKC").trim().toLowerCase();
  if (display.length > 254 || !EMAIL.test(display)) return null;
  let [local, domain] = display.split("@");
  if (GMAIL.has(domain)) {
    local = local.split("+")[0].replace(/\./g, "");
    domain = "gmail.com";
    if (!local) return null;
  }
  return { display, norm: `${local}@${domain}` };
}

function keyBytes(env) {
  const s = env.DATA_KEY;
  if (!s) throw Object.assign(new Error("missing DATA_KEY"), { code: "data_key" });
  try {
    const b = unb64(s);
    if (b.length === 32) return b;
  } catch { /* לא base64 — סביבת בדיקה */ }
  return enc.encode(s.padEnd(32, "#").slice(0, 32));
}

export async function emailHash(env, norm) {
  const key = await crypto.subtle.importKey("raw", keyBytes(env), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("email|" + norm)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function aes(env) {
  return crypto.subtle.importKey("raw", keyBytes(env), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(env), enc.encode(text));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return b64(out);
}

export async function open(env, sealed) {
  if (!sealed) return null;
  try {
    const b = unb64(sealed);
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, await aes(env), b.slice(12)));
  } catch {
    return null;
  }
}

/** שם תצוגה: 1–40 תווים, בלי תווי בקרה. "" ⇐ מחיקה */
export function normalizeName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (name.length > 40) return null;
  return name;
}
