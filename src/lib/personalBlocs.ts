import type { Bloc } from "./crowdApi";
export function blocValues(blocs: Bloc[], values: Record<string, number | undefined>, mapping: Record<string, string>) {
  return blocs.map(b => {
    const lists = [...new Set(b.lists)];
    const missing = lists.filter(id => !mapping[id] || !Number.isFinite(values[mapping[id]]));
    return { ...b, lists, missing, total: missing.length || !lists.length ? null : lists.reduce((n, id) => n + values[mapping[id]]!, 0) };
  });
}
