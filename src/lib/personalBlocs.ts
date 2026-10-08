import type { Bloc } from "./crowdApi";
export function blocValues(blocs: Bloc[], values: Record<string, number | undefined>, mapping: Record<string, string>) {
  return blocs.map(b => {
    const lists = [...new Set(b.lists)];
    const missing = lists.filter(id => !mapping[id] || !Number.isFinite(values[mapping[id]]));
    return { ...b, lists, missing, total: missing.length || !lists.length ? null : lists.reduce((n, id) => n + values[mapping[id]]!, 0) };
  });
}

/** משפחה היסטורית נספרת רק כשהגוש מכיל את כל רכיביה הנוכחיים, וכל רשימת עבר נספרת פעם אחת. */
export function historicalBlocValues(blocs: Bloc[], families: { k26: string[]; k25: string[] }[], values: Record<string, number>) {
  return blocs.map(b => {
    const lists = [...new Set(b.lists)];
    const complete = families.filter(f => f.k26.length > 0 && f.k26.every(id => lists.includes(id)) && f.k25.every(name => Number.isFinite(values[name])));
    const missing = lists.filter(id => !complete.some(f => f.k26.includes(id)));
    const previous = [...new Set(complete.flatMap(f => f.k25))];
    return { ...b, lists, missing, total: !lists.length || missing.length ? null : previous.reduce((n,name) => n + values[name],0) };
  });
}
