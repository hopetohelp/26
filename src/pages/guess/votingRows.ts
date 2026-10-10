import type { Cell, Dashboard } from "../../lib/crowdApi";
import { results } from "../../lib/data";
import { IDS, VOTE_MAP, k25VoteName, nameOf, V2022_LABEL, V2026_LABEL } from "./model";
const percent = (cells: Record<string, Cell> | undefined, key: string): number | null => {
  if (!cells || !Object.values(cells).some(c => c.of > 0)) return null;
  const c = cells[key];
  return c?.hidden ? null : c ? Math.round(c.n / c.of * 1000) / 10 : 0;
};
/** כמה משתתפים ענו כך (מספר), באותם כללים של `percent` */
const count = (cells: Record<string, Cell> | undefined, key: string): number | null => {
  if (!cells || !Object.values(cells).some(c => c.of > 0)) return null;
  const c = cells[key];
  return c?.hidden ? null : c?.n ?? 0;
};
/** שורות למי שלא הצביע (הכרעת בעלים 9.10.2026): לא הצביעו בעבר / לא מתכננים להצביע, ומי שלא הייתה לו זכות הצבעה. נוסח בגוף שלישי, בניגוד לתשובות בשאלון. */
const NON_VOTER_NAME: Record<string, string> = { none: "לא הצביעו / לא מתכננים להצביע", ineligible: "לא הייתה זכות הצבעה" };
const answerCount = (d: Dashboard, key: string) => (d.vote2022?.all[key]?.n ?? 0) + (d.vote2026?.all[key]?.n ?? 0);
export function votingRows(d: Dashboard) {
  const previous = results.find(r => r.id === "k25")!;
  const matched = new Set(Object.values(VOTE_MAP));
  const rows = IDS.map(id => {
    const old = previous.lists.find(l => l.letters === VOTE_MAP[id]);
    return { key: id, name: nameOf(id), official: old ? Math.round(old.votes / previous.valid * 10000) / 100 : null, previous: old ? percent(d.vote2022?.all, old.letters) : null, next: percent(d.vote2026?.all, id), previousN: old ? count(d.vote2022?.all, old.letters) : null, nextN: count(d.vote2026?.all, id) };
  });
  for (const l of previous.lists) if (!matched.has(l.letters)) rows.push({ key: `2022:${l.letters}`, name: `${k25VoteName(l.letters)} (2022)`, official: Math.round(l.votes / previous.valid * 10000) / 100, previous: percent(d.vote2022?.all, l.letters), next: null, previousN: count(d.vote2022?.all, l.letters), nextN: null });
  const keys = new Set([...Object.keys(d.vote2022?.all ?? {}).filter(k => k in V2022_LABEL), ...Object.keys(d.vote2026?.all ?? {}).filter(k => k in V2026_LABEL)]);
  for (const key of Object.keys(NON_VOTER_NAME)) if (keys.has(key)) rows.push({ key: `answer:${key}`, name: NON_VOTER_NAME[key] ?? V2022_LABEL[key] ?? V2026_LABEL[key], official: null, previous: key in V2022_LABEL ? percent(d.vote2022?.all,key) : null, next: key in V2026_LABEL ? percent(d.vote2026?.all,key) : null, previousN: key in V2022_LABEL ? count(d.vote2022?.all,key) : null, nextN: key in V2026_LABEL ? count(d.vote2026?.all,key) : null });
  return rows.filter(row => {
    if (row.key.startsWith("answer:")) return row.key.slice(7) in NON_VOTER_NAME && answerCount(d, row.key.slice(7)) > 0;
    const old = row.key.startsWith("2022:") ? row.key.slice(5) : VOTE_MAP[row.key];
    return (old && (d.vote2022?.all[old]?.n ?? 0) > 0) || (d.vote2026?.all[row.key]?.n ?? 0) > 0;
  });
}
