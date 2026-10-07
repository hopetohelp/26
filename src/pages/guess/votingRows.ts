import type { Cell, Dashboard } from "../../lib/crowdApi";
import { results } from "../../lib/data";
import { IDS, K25_MAP, nameOf, V2022_LABEL, V2026_LABEL } from "./model";
const percent = (cells: Record<string, Cell> | undefined, key: string): number | null => {
  if (!cells || !Object.values(cells).some(c => c.of > 0)) return null;
  const c = cells[key];
  return c?.hidden ? null : c ? Math.round(c.n / c.of * 1000) / 10 : 0;
};
export function votingRows(d: Dashboard) {
  const previous = results.find(r => r.id === "k25")!;
  const matched = new Set(Object.values(K25_MAP));
  const rows = IDS.map(id => {
    const old = previous.lists.find(l => l.letters === K25_MAP[id]);
    return { key: id, name: nameOf(id), official: old ? Math.round(old.votes / previous.valid * 10000) / 100 : null, previous: old ? percent(d.vote2022?.all, old.letters) : null, next: percent(d.vote2026?.all, id) };
  });
  for (const l of previous.lists) if (!matched.has(l.letters)) rows.push({ key: `2022:${l.letters}`, name: `${l.short} (2022)`, official: Math.round(l.votes / previous.valid * 10000) / 100, previous: percent(d.vote2022?.all, l.letters), next: null });
  const keys = new Set([...Object.keys(d.vote2022?.all ?? {}).filter(k => k in V2022_LABEL), ...Object.keys(d.vote2026?.all ?? {}).filter(k => k in V2026_LABEL)]);
  for (const key of keys) rows.push({ key: `answer:${key}`, name: key === "none" ? "לא הצביעו / לא מתכננים להצביע" : V2022_LABEL[key] ?? V2026_LABEL[key], official: null, previous: key in V2022_LABEL ? percent(d.vote2022?.all,key) : null, next: key in V2026_LABEL ? percent(d.vote2026?.all,key) : null });
  return rows.filter(row => {
    if (row.key.startsWith("answer:")) return false;
    const old = row.key.startsWith("2022:") ? row.key.slice(5) : K25_MAP[row.key];
    return (old && (d.vote2022?.all[old]?.n ?? 0) > 0) || (d.vote2026?.all[row.key]?.n ?? 0) > 0;
  });
}
