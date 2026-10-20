export interface LocalityRow { code: string; name: string; external: boolean; eligible: number; voted: number; valid: number; invalid: number; votes: Record<string, number> }
export interface LocalityElection { id: string; label: string; date: string; source: string; sha256: string; eligibleInLocalityFile: number; eligibleNational: number; lists: { letters: string; name: string }[]; rows: LocalityRow[] }
/** משותף לטבלה באתר ולכלי MCP. מעטפות חיצוניות נשארות רשומה עצמאית. */
export function queryLocalities(election: LocalityElection, query = "", offset = 0, limit = 25) {
  const q = query.trim();
  const rows = election.rows.filter(r => !q || r.name.includes(q) || r.code === q);
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const size = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
  return { matched: rows.length, offset: start, nextOffset: start + size < rows.length ? start + size : null, rows: rows.slice(start, start + size) };
}
export function localityCsv(e: LocalityElection) {
  const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return '\uFEFF' + [['יישוב', 'סמל יישוב', 'בעלי זכות בחירה', 'מצביעים', 'כשרים', 'פסולים', ...e.lists.map(l => l.name)], ...e.rows.map(r => [r.name, r.code, r.eligible, r.voted, r.valid, r.invalid, ...e.lists.map(l => r.votes[l.letters] ?? 0)])].map(row => row.map(quote).join(',')).join('\r\n');
}
