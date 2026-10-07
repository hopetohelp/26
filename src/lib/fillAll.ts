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
  | { kind: "no-eligible"; bloc: string | null; remainder: number }
  | { kind: "range-impossible"; bloc: string | null; target: number };

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

export function fillAll(ids: string[], cells: Record<string, SeatCell | undefined>, polls: Record<string, number>, blocs: Bloc[], ranges: Record<string, [number, number]> = {}): FillResult {
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
    const lower = Object.fromEntries(free.map((id) => [id, Math.max(0, ranges[id]?.[0] ?? 0)]));
    const upper = Object.fromEntries(free.map((id) => [id, Math.max(lower[id], ranges[id]?.[1] ?? TOTAL)]));
    const minSum = free.reduce((a,id)=>a+lower[id],0);
    const maxSum = free.reduce((a,id)=>a+upper[id],0);
    if (remainder < minSum || remainder > maxSum) return { kind: "range-impossible", bloc, target: remainder };
    const alloc = { ...lower };
    let left = remainder - minSum;
    while (left > 0) {
      const open = free.filter((id) => alloc[id] < upper[id]);
      if (!open.length) return { kind: "range-impossible", bloc, target: remainder };
      const step = largestRemainder(left, Object.fromEntries(open.map((id)=>[id, weights[id]])));
      let added = 0;
      for (const id of open) {
        const n = Math.min(step[id] ?? 0, upper[id] - alloc[id]);
        alloc[id] += n;
        added += n;
      }
      if (!added) {
        const id = open.sort((a,b)=>weights[b]-weights[a])[0];
        alloc[id]++;
        added=1;
      }
      left -= added;
    }
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
    case "range-impossible":
      return `${e.bloc ? `בגוש "${e.bloc}"` : "בחלוקה הכללית"} אי אפשר להגיע ל-${e.target} מנדטים בלי לצאת מטווחי הסקרים. שנו את מספר הגוש או ערך נעול.`;
  }
}

// ---- "השלם הכול" בניחוש לפי אחוזי הצבעה

export type PctFillResult = { ok: true; pct: Record<string, number>; changed: string[] } | { ok: false; error: { kind: "pct-over"; locked: number } | { kind: "pct-no-eligible" } };

/**
 * משלים את האחוזים של הרשימות הלא-נעולות לפי חלקן בממוצע הסקרים (model.json central.shares).
 * החלק של "אחרות" בממוצע (100 − סכום כל הרשימות) נשמר באותו יחס, כך שהשורה "אחרות / קולות שלא עברו" לא נמחקת.
 * דיוק: עשירית אחוז, בשיטת השארית הגדולה. נעולים לא זזים.
 */
export function fillPct(ids: string[], pct: Record<string, number>, locked: (id: string) => boolean, shares: Record<string, number>): PctFillResult {
  const lockedSum = ids.reduce((a, id) => a + (locked(id) ? pct[id] || 0 : 0), 0);
  if (lockedSum > 100.05) return { ok: false, error: { kind: "pct-over", locked: Math.round(lockedSum * 10) / 10 } };
  const free = ids.filter((id) => !locked(id));
  const weights = Object.fromEntries(free.map((id) => [id, Math.max(0, shares[id] ?? 0)]));
  const W = free.reduce((a, id) => a + weights[id], 0);
  if (free.length && W <= 0) return { ok: false, error: { kind: "pct-no-eligible" } };
  const others = Math.max(0, 100 - ids.reduce((a, id) => a + Math.max(0, shares[id] ?? 0), 0));
  const room = Math.max(0, 100 - lockedSum);
  const tenths = Math.floor(((room * W) / (W + others)) * 10 + 1e-6);
  const alloc = largestRemainder(tenths, weights);
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = locked(id) ? pct[id] || 0 : (alloc[id] ?? 0) / 10;
  const changed = free.filter((id) => (pct[id] || 0) !== out[id]);
  return { ok: true, pct: out, changed };
}

export function pctFillErrorText(e: Extract<PctFillResult, { ok: false }>["error"]): string {
  return e.kind === "pct-over" ? `האחוזים הנעולים מגיעים ל-${e.locked}%, יותר מ-100%. כדאי להוריד או לשחרר נעילה.` : "אין רשימה לא-נעולה עם חלק בממוצע הסקרים. אפשר לשחרר נעילה.";
}
