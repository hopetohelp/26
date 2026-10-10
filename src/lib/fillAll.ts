/**
 * "השלם הכול" — בדיוק לפי docs/השתתפות-גולשים.md:
 * 1. ערך נעול אינו משתנה.
 * 2. גוש עם יעד: יתרה = יעד − נעולים בגוש ⇐ בין הלא-נעולות בגוש, לפי חלקן בממוצע הסקרים.
 * 3. בגושים נפרדים, היתרה מחולקת גם למפלגות מחוץ לגושים; אין דרישת כיסוי או סכום יעדים 120.
 *    בגושים חופפים פותרים כל יעד בנפרד לצד סך המפלגות 120; אין חיבור של יעדי התרחישים.
 * 4. שלמים בשיטת השארית הגדולה; רשימה שבממוצע הסקרים מתחת לסף (0 מנדטים) מקבלת 0.
 * 5. סתירה ⇐ שגיאה, בלי השלמה.
 * 6. אין תוצאה של 1–3 מנדטים לרשימה פתוחה (מתחת לסף): היא מקבלת 0, והמנדטים עוברים לרשימה פתוחה עוברת באותם גושים (הכרעת בעלים 8.10.2026).
 */
import type { Bloc, SeatCell } from "./crowdApi";

export const TOTAL = 120;

export type FillError =
  | { kind: "over-120"; locked: number }
  | { kind: "bloc-over"; bloc: string; locked: number; target: number }
  | { kind: "bloc-locked-mismatch"; bloc: string; locked: number; target: number }
  | { kind: "targets-over"; sum: number }
  | { kind: "overlap-impossible" }
  | { kind: "search-limit" }
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

export const MIN_PASSING = 4;

export function fillAll(ids: string[], cells: Record<string, SeatCell | undefined>, polls: Record<string, number>, blocs: Bloc[], ranges: Record<string, [number, number]> = {}): FillResult {
  const r = fillRaw(ids, cells, polls, blocs, ranges);
  if (!r.ok) return r;
  const seats = { ...r.seats };
  const free = ids.filter((id) => !cells[id]?.locked);
  const key = (id: string) => blocs.filter((b) => b.target !== null && b.lists.includes(id)).map((b) => b.id).join("|");
  for (const id of free) {
    const v = seats[id]?.v ?? 0;
    if (v <= 0 || v >= MIN_PASSING) continue;
    const to = free.filter((o) => o !== id && (seats[o]?.v ?? 0) >= MIN_PASSING && key(o) === key(id)).sort((a, b) => (polls[b] ?? 0) - (polls[a] ?? 0))[0];
    if (!to) continue;
    seats[to] = { ...seats[to], v: seats[to].v + v };
    seats[id] = { ...seats[id], v: 0 };
  }
  const changed = ids.filter((id) => !cells[id]?.locked && (cells[id]?.v ?? 0) !== seats[id].v);
  return { ok: true, seats, changed };
}

function fillRaw(ids: string[], cells: Record<string, SeatCell | undefined>, polls: Record<string, number>, blocs: Bloc[], ranges: Record<string, [number, number]> = {}): FillResult {
  const locked = (id: string) => !!cells[id]?.locked;
  const lockedV = (id: string) => (locked(id) ? cells[id]!.v : 0);
  const totalLocked = ids.reduce((a, id) => a + lockedV(id), 0);
  if (totalLocked > TOTAL) return { ok: false, error: { kind: "over-120", locked: totalLocked } };

  const targeted = blocs.filter((b) => b.target !== null);
  const memberships = targeted.flatMap(b => b.lists);
  if (new Set(memberships).size !== memberships.length) return fillOverlapping(ids, cells, polls, targeted, ranges);
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

/** פתרון של אילוצים חופפים: סך הכנסת 120, ולכל גוש סכום עצמאי.
 * חיפוש שלמים עם חסמים ומזכרון; ערכים הקרובים לסקרים נבדקים תחילה.
 * מגבלת עבודה מונעת חסימת הממשק; אין תוצאה חלקית ואין דריסה של נעילות.
 */
function fillOverlapping(ids: string[], cells: Record<string, SeatCell | undefined>, polls: Record<string, number>, targeted: Bloc[], ranges: Record<string, [number, number]>): FillResult {
  const groups = [{ lists: ids, target: TOTAL }, ...targeted.map(b => ({ lists: [...new Set(b.lists)], target: b.target! }))];
  const free = ids.filter(id => !cells[id]?.locked).sort((a, b) => groups.filter(g => g.lists.includes(b)).length - groups.filter(g => g.lists.includes(a)).length || a.localeCompare(b));
  const remaining = groups.map(g => g.target - g.lists.reduce((n, id) => n + (cells[id]?.locked ? cells[id]!.v : 0), 0));
  const lo = free.map(id => Math.max(0, Math.ceil(ranges[id]?.[0] ?? 0)));
  const hi = free.map((id, i) => Math.max(lo[i], Math.floor(ranges[id]?.[1] ?? (polls[id] > 0 ? TOTAL : 0))));
  const member = free.map(id => groups.map(g => g.lists.includes(id)));
  const suffixLo = Array.from({ length: free.length + 1 }, () => groups.map(() => 0));
  const suffixHi = suffixLo.map(row => [...row]);
  for (let i = free.length - 1; i >= 0; i--) for (let g = 0; g < groups.length; g++) {
    suffixLo[i][g] = suffixLo[i + 1][g] + (member[i][g] ? lo[i] : 0);
    suffixHi[i][g] = suffixHi[i + 1][g] + (member[i][g] ? hi[i] : 0);
  }
  const dead = new Set<string>();
  const alloc: number[] = [];
  let work = 0;
  let limited = false;
  const visit = (i: number, rem: number[]): boolean => {
    if (++work > 100000) { limited = true; return false; }
    if (rem.some((n, g) => n < suffixLo[i][g] || n > suffixHi[i][g])) return false;
    if (i === free.length) return rem.every(n => n === 0);
    const key = `${i}:${rem.join(",")}`;
    if (dead.has(key)) return false;
    let lower = lo[i], upper = hi[i];
    for (let g = 0; g < groups.length; g++) if (member[i][g]) {
      lower = Math.max(lower, rem[g] - suffixHi[i + 1][g]);
      upper = Math.min(upper, rem[g] - suffixLo[i + 1][g]);
    }
    const choices = Array.from({ length: Math.max(0, upper - lower + 1) }, (_, n) => lower + n).sort((a, b) => Math.abs(a - (polls[free[i]] ?? 0)) - Math.abs(b - (polls[free[i]] ?? 0)) || a - b);
    for (const value of choices) {
      alloc[i] = value;
      if (visit(i + 1, rem.map((n, g) => n - (member[i][g] ? value : 0)))) return true;
      if (limited) return false;
    }
    dead.add(key);
    return false;
  };
  if (!visit(0, remaining)) return { ok: false, error: { kind: limited ? "search-limit" : "overlap-impossible" } };
  const seats: Record<string, SeatCell> = Object.fromEntries(ids.filter(id => cells[id]?.locked).map(id => [id, { ...cells[id]! }]));
  free.forEach((id, i) => { seats[id] = { v: alloc[i], src: "filled", locked: false }; });
  return { ok: true, seats, changed: free.filter(id => (cells[id]?.v ?? 0) !== seats[id].v) };
}

/** הודעה בעברית לכל סוג סתירה */
export function fillErrorText(e: FillError): string {
  switch (e.kind) {
    case "overlap-impossible": return "הגושים שלכם חופפים (מפלגה אחת נמצאת ביותר מגוש אחד), ואין חלוקה שמקיימת את מספרי שני הגושים יחד עם המפלגות הנעולות. למשל: גוש אחד דורש יותר מנדטים ממה שהגוש השני משאיר למפלגות המשותפות. שנו מספר באחד הגושים או שחררו נעילה.";
    case "search-limit": return "ההשלמה מורכבת מדי לחישוב מיידי. נסו פחות יעדים או קבעו מנדטים ידנית. הטיוטה לא השתנתה.";
    case "over-120":
      return `הערכים הנעולים מגיעים ל-${e.locked}, יותר מ-120. כדאי להוריד או לשחרר נעילה.`;
    case "targets-over":
      return `מספרי הגושים מסתכמים ב-${e.sum}, יותר מ-120 מושבים בכנסת. הקטינו את המספר באחד הגושים.`;
    case "bloc-over":
      return `בגוש "${e.bloc}" המפלגות הנעולות כבר מגיעות ל-${e.locked} מנדטים, יותר מ-${e.target} שקבעתם לגוש. הגדילו את מספר הגוש או הקטינו מפלגה נעולה בו.`;
    case "bloc-locked-mismatch":
      return `בגוש "${e.bloc}" כל המפלגות נעולות ומסתכמות ב-${e.locked}, אבל קבעתם לגוש ${e.target}. אין מפלגה פתוחה שתשלים את ההפרש: שחררו נעילה או שנו את מספר הגוש.`;
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
