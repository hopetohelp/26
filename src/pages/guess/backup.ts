/**
 * גיבוי במכשיר (בלי שרת): כשהחיבור לשרת חסום, אפשר להוריד את ההשערה כקובץ או להעתיק אותה כקוד, ולשחזר ממנו בכל דפדפן.
 * הקוד מכיל רק את ההשערה (מנדטים, גושים, הצבעה) — בלי סיסמה, אסימון או קישור אישי. הוא לא נכנס לממוצע המשתתפים עד שנשמר בשרת.
 */
import { validateBlocs, validateSeats, validateVote } from "../../lib/crowdValidate";
import { loadDraft, loadSaved, saveDraft } from "../../lib/crowdSession";
import type { BlocsPayload, SeatsPayload, Unit, VotePayload } from "../../lib/crowdApi";
import { IDS, K25_IDS } from "./model";

const PREFIX = "E26:";
const UNITS: Unit[] = ["seats", "blocs", "vote"];
export type Backup = Partial<{ seats: SeatsPayload; blocs: BlocsPayload; vote: VotePayload }>;

const b64 = (s: string) => {
  let bin = "";
  new TextEncoder().encode(s).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)));

export function encodeBackup(b: Backup): string {
  return PREFIX + b64(JSON.stringify({ v: 1, ...b }));
}

/** מפענח ובודק כל יחידה כמו בשמירה; מחזיר null אם הקוד פגום או ריק */
export function decodeBackup(text: string): Backup | null {
  const raw = text.trim().replace(/\s+/g, "");
  if (!raw.startsWith(PREFIX) || raw.length > 40_000) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(unb64(raw.slice(PREFIX.length)));
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || o.v !== 1) return null;
  const out: Backup = {};
  try {
    if (o.seats) {
      if (validateSeats(o.seats as SeatsPayload, IDS)) return null;
      out.seats = o.seats as SeatsPayload;
    }
    if (o.blocs) {
      if (validateBlocs(o.blocs as BlocsPayload, IDS)) return null;
      out.blocs = o.blocs as BlocsPayload;
    }
    if (o.vote) {
      if (validateVote(o.vote as VotePayload, K25_IDS, IDS)) return null;
      out.vote = o.vote as VotePayload;
    }
  } catch {
    return null;
  }
  return Object.keys(out).length ? out : null;
}

/** ההשערה כפי שהיא במכשיר: הטיוטה, ואם אין — הגרסה שנשמרה */
export function currentBackup(): Backup {
  const b: Backup = {};
  for (const u of UNITS) {
    const p = loadDraft(u) ?? loadSaved(u);
    if (p) (b as Record<string, unknown>)[u] = p;
  }
  return b;
}

/** משחזר כטיוטות (הדף נטען מחדש אחרי זה) */
export function restoreBackup(b: Backup) {
  for (const u of UNITS) if (b[u]) saveDraft(u, b[u]);
}
