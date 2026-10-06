/**
 * "השלם הכול" — בדיוק לפי docs/השתתפות-גולשים.md:
 * 1. ערך נעול אינו משתנה.
 * 2. גוש עם יעד: יתרה = יעד − נעולים בגוש ⇐ בין הלא-נעולות בגוש, לפי חלקן בממוצע הסקרים.
 * 3. יתרה כללית = 120 − יעדי הגושים − נעולים מחוץ לגושים עם יעד ⇐ בין שאר הלא-נעולות.
 * 4. שלמים בשיטת השארית הגדולה; רשימה שבממוצע הסקרים מתחת לסף (0 מנדטים) מקבלת 0.
 * 5. סתירה ⇐ שגיאה, בלי השלמה.
 */
import type { Bloc, SeatCell } from "./crowdApi";

export const TOTAL = 120;

export type FillError =
  | { kind: "over-120"; locked: number }
  | { kind: "bloc-over"; bloc: string; locked: number; target: number }
  | { kind: "bloc-locked-mismatch"; bloc: string; locked: number; target: number }
  | { kind: "targets-over"; sum: number }
  | { kind: "no-eligible"; bloc: string | null; remainder: number };

export type FillResult = { ok: true; seats: Record<string, SeatCell>; changed: string[] } | { ok: false; error: FillError };

/** שיטת השארית הגדולה. שוויון בשארית ⇐ משקל גדול יותר, ואז לפי המזהה (תוצאה יציבה). */
export function largestRemainder(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const out: Record<string, number> = Object.fromEntries(Object.keys(weights).map((id) => [id, 0]));
  const W = ids.reduce((a, id) => a + weights[id], 0);
  if (total <= 0 || W <= 0) return out;
  const rem: { id: string; r: number }[] = [];
  let given = 0;
  for (const id of ids) {
    const q = (total * weights[id]) / W;
    out[id] = Math.floor(q + 1e-9);
    given += out[id];
    rem.push({ id, r: q - out[id] });
  }
  rem.sort((a, b) => b.r - a.r || weights[b.id] - weights[a.id] || (a.id < b.id ? -1 : 1));
  for (let i = 0; given < total; i = (i + 1) % rem.length, given++) out[rem[i].id]++;
  return out;
}

export function fillAll(ids: string[], cells: Record<string, SeatCell | undefined>, polls: Record<string, number>, blocs: Bloc[]): FillResult {
  const locked = (id: string) => !!cells[id]?.locked;
  const lockedV = (id: string) => (locked(id) ? cells[id]!.v : 0);
  const totalLocked = ids.reduce((a, id) => a + lockedV(id), 0);
  if (totalLocked > TOTAL) return { ok: false, error: { kind: "over-120", locked: totalLocked } };

  const targeted = blocs.filter((b) => b.target !== null);
  const targetSum = targeted.reduce((a, b) => a + (b.target ?? 0), 0);
  if (targetSum > TOTAL) return { ok: false, error: { kind: "targets-over", sum: targetSum } };

  const result: Record<string, SeatCell> = {};
  for (const id of ids) if (locked(id)) result[id] = { ...cells[id]! };
  const inTargeted = new Set<string>();

  const distribute = (bucket: string[], remainder: number, bloc: string | null): FillError | null => {
    const free = bucket.filter((id) => !locked(id));
    const weights = Object.fromEntries(free.map((id) => [id, Math.max(0, polls[id] ?? 0)]));
    if (remainder > 0 && !free.some((id) => weights[id] > 0)) return { kind: "no-eligible", bloc, remainder };
    const alloc = largestRemainder(remainder, weights);
    for (const id of free) result[id] = { v: alloc[id] ?? 0, src: "filled", locked: false };
    return null;
  };

  for (const b of targeted) {
    const members = b.lists.filter((id) => ids.includes(id));
    members.forEach((id) => inTargeted.add(id));
    const l = members.reduce((a, id) => a + lockedV(id), 0);
    const t = b.target!;
    if (l > t) return { ok: false, error: { kind: "bloc-over", bloc: b.name, locked: l, target: t } };
    if (members.every(locked) && l !== t) return { ok: false, error: { kind: "bloc-locked-mismatch", bloc: b.name, locked: l, target: t } };
    const err = distribute(members, t - l, b.name);
    if (err) return { ok: false, error: err };
  }

  const rest = ids.filter((id) => !inTargeted.has(id));
  const restLocked = rest.reduce((a, id) => a + lockedV(id), 0);
  const remainder = TOTAL - targetSum - restLocked;
  if (remainder < 0) return { ok: false, error: { kind: "over-120", locked: targetSum + restLocked } };
  const err = distribute(rest, remainder, null);
  if (err) return { ok: false, error: err };

  const changed = ids.filter((id) => !locked(id) && (cells[id]?.v ?? 0) !== result[id].v);
  return { ok: true, seats: result, changed };
}

/** הודעה בעברית לכל סוג סתירה */
export function fillErrorText(e: FillError): string {
  switch (e.kind) {
    case "over-120":
      return `הערכים הנעולים מגיעים ל-${e.locked}, יותר מ-120. כדאי להוריד או לשחרר נעילה.`;
    case "targets-over":
      return `יעדי הגושים מסתכמים ב-${e.sum}, יותר מ-120.`;
    case "bloc-over":
      return `בגוש "${e.bloc}" הערכים הנעולים (${e.locked}) גדולים מהיעד (${e.target}).`;
    case "bloc-locked-mismatch":
      return `בגוש "${e.bloc}" כל הרשימות נעולות, וסכומן (${e.locked}) שונה מהיעד (${e.target}).`;
    case "no-eligible":
      return `${e.bloc ? `בגוש "${e.bloc}"` : "מחוץ לגושים"} נשארו ${e.remainder} מנדטים, ואין רשימה לא-נעולה שעוברת את הסף בממוצע הסקרים. אפשר לשחרר נעילה או לקבוע ערך ידנית.`;
  }
}
