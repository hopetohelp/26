/**
 * קישור שיתוף להשערה: https://hopetohelp.github.io/26/#/guess?g=<base64url של JSON קומפקטי>.
 * התוכן: מנדטים לכל רשימה, אחוזים (אם ההשערה הייתה לפי אחוזים) ושם משתתף — רק אם המשתתף בחר לצרף אותו.
 * אין בו שום פרט אחר. הפענוח הגנתי: כל ערך נבדק, ומה שלא עובר ⇐ null (הכרטיס פשוט לא מוצג).
 */
import { TOTAL } from "./fillAll";

export const SITE_URL = "https://hopetohelp.github.io/26/";
const MAX_LEN = 1500;
const USER_RE = /^[א-תA-Za-z0-9_]{3,24}$/;

export interface SharedGuess {
  seats: Record<string, number>;
  pct?: Record<string, number>;
  username?: string;
}

function toB64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** קידוד: רק רשימות עם ערך; אחוזים בעשיריות (שלמים) */
export function encodeGuess(g: SharedGuess): string {
  const s = Object.fromEntries(Object.entries(g.seats).filter(([, v]) => v > 0));
  const o: { s: Record<string, number>; p?: Record<string, number>; u?: string } = { s };
  if (g.pct) o.p = Object.fromEntries(Object.entries(g.pct).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(v * 10)]));
  if (g.username) o.u = g.username;
  return toB64url(JSON.stringify(o));
}

export function shareUrl(g: SharedGuess, base = SITE_URL): string {
  return `${base}#/guess?g=${encodeGuess(g)}`;
}

const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o);

/** פענוח הגנתי: מזהים מוכרים בלבד, מנדטים שלמים שמסתכמים ב-120, אחוזים 0..100 בסכום עד 100, שם משתתף תקין */
export function decodeGuess(raw: string | null, ids: string[]): SharedGuess | null {
  if (!raw || raw.length > MAX_LEN || !/^[\w-]+$/.test(raw)) return null;
  let o: unknown;
  try {
    o = JSON.parse(fromB64url(raw));
  } catch {
    return null;
  }
  if (!isObj(o) || !isObj(o.s)) return null;
  const seats: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  let sum = 0;
  for (const [id, v] of Object.entries(o.s)) {
    if (!ids.includes(id) || !Number.isInteger(v) || (v as number) < 0 || (v as number) > TOTAL) return null;
    seats[id] = v as number;
    sum += v as number;
  }
  if (sum !== TOTAL) return null;
  const out: SharedGuess = { seats };
  if (o.p !== undefined) {
    if (!isObj(o.p)) return null;
    const pct: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let ps = 0;
    for (const [id, v] of Object.entries(o.p)) {
      if (!ids.includes(id) || !Number.isInteger(v) || (v as number) < 0 || (v as number) > 1000) return null;
      pct[id] = (v as number) / 10;
      ps += v as number;
    }
    if (ps > 1000) return null;
    out.pct = pct;
  }
  if (o.u !== undefined) {
    if (typeof o.u !== "string" || !USER_RE.test(o.u)) return null;
    out.username = o.u;
  }
  return out;
}
