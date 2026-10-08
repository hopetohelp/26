import type { Bloc } from "../../lib/crowdApi";
export const customBlocs = (ids: string[]): Bloc[] => [
  { id: "a", name: "גוש א", lists: [], target: null },
  { id: "b", name: "גוש ב", lists: [...ids], target: null },
];
/** הוספה לתרחיש אינה מוציאה מפלגה מתרחיש אחר. */
export function moveList(blocs: Bloc[], id: string, target: string): Bloc[] {
  if (!blocs.some(b => b.id === target)) return blocs;
  return blocs.map(b => b.id === target ? { ...b, lists: [...new Set([...b.lists, id])] } : b);
}
export function removeBloc(blocs: Bloc[], id: string): Bloc[] {
  return blocs.filter(b => b.id !== id);
}
/** מסירים רק את החברות בגוש שממנו נגרר הכרטיס. */
export function removeList(blocs: Bloc[], id: string, from: string): Bloc[] {
  return blocs.map(b => b.id === from ? { ...b, lists: b.lists.filter(list => list !== id) } : b);
}
