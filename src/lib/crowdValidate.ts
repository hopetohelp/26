/** בדיקות שמשקפות את חוזי השמירה (docs/השתתפות-גולשים.md). מחזירות הודעה בעברית, או null כשהכול תקין. */
import type { BlocsPayload, SeatsPayload, VotePayload } from "./crowdApi";
import { TOTAL } from "./fillAll";

export const V2022_SPECIAL = ["other", "none", "blank", "ineligible", "private"] as const;
export const V2026_SPECIAL = ["undecided", "none", "ineligible", "private"] as const;
export const MAX_BLOCS = 4;

export function validateVote(p: VotePayload, ids2022: string[], ids2026: string[]): string | null {
  if (p.v2022 === null && p.v2026 === null) return "צריך למלא לפחות שדה אחד.";
  if (p.v2022 !== null && !ids2022.includes(p.v2022) && !(V2022_SPECIAL as readonly string[]).includes(p.v2022)) return "בחירה לא מוכרת ל-2022.";
  if (p.v2026 !== null && !ids2026.includes(p.v2026) && !(V2026_SPECIAL as readonly string[]).includes(p.v2026)) return "בחירה לא מוכרת ל-2026.";
  return null;
}

export const seatsSum = (p: Pick<SeatsPayload, "seats">) => Object.values(p.seats).reduce((a, c) => a + c.v, 0);

export function validateSeats(p: SeatsPayload, ids: string[]): string | null {
  for (const [id, c] of Object.entries(p.seats)) {
    if (!ids.includes(id)) return "רשימה לא מוכרת.";
    if (!Number.isInteger(c.v) || c.v < 0 || c.v > TOTAL) return "כל ערך חייב להיות מספר שלם בין 0 ל-120.";
  }
  const s = seatsSum(p);
  if (s !== TOTAL) return s < TOTAL ? `נותרו ${TOTAL - s} לחלוקה.` : `יש ${s - TOTAL} יותר מדי.`;
  return null;
}

/** אחוזי הצבעה (ניחוש במצב pct): 0..100, עשירית אחוז לכל היותר, סכום עד 100 — כמו בשרת */
export function validatePct(pct: Record<string, number>, ids: string[]): string | null {
  let sum = 0;
  for (const [id, v] of Object.entries(pct)) {
    if (!ids.includes(id)) return "רשימה לא מוכרת.";
    if (!Number.isFinite(v) || v < 0 || v > 100 || Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) return "כל אחוז בין 0 ל-100, עם ספרה אחת אחרי הנקודה.";
    sum += v;
  }
  if (sum > 100.05) return `סכום האחוזים ${Math.round(sum * 10) / 10}%, יותר מ-100%.`;
  return null;
}

export function validateBlocs(p: BlocsPayload, ids: string[]): string | null {
  if (p.blocs.length === 0) return "אין גושים.";
  if (p.blocs.length > MAX_BLOCS) return `עד ${MAX_BLOCS} גושים.`;
  const seen = new Set<string>();
  for (const b of p.blocs) {
    if (!b.name.trim()) return "לכל גוש צריך שם.";
    if (b.target !== null && (!Number.isInteger(b.target) || b.target < 0 || b.target > TOTAL)) return "יעד חייב להיות מספר שלם בין 0 ל-120.";
    for (const id of b.lists) {
      if (!ids.includes(id)) return "רשימה לא מוכרת.";
      if (seen.has(id)) return "רשימה יכולה להיות בגוש אחד לכל היותר.";
      seen.add(id);
    }
  }
  const targets = p.blocs.map((b) => b.target);
  const sum = targets.reduce<number>((a, t) => a + (t ?? 0), 0);
  if (sum > TOTAL) return `סכום היעדים ${sum}, יותר מ-120.`;
  if (targets.every((t) => t !== null) && sum !== TOTAL) return `כשלכל הגושים יש יעד, הסכום חייב להיות 120 (כרגע ${sum}).`;
  return null;
}
