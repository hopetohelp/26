import type { Bloc } from "../../lib/crowdApi";
export const customBlocs = (ids: string[]): Bloc[] => [
  { id: "a", name: "גוש א", lists: [], target: null },
  { id: "b", name: "גוש ב", lists: [...ids], target: null },
];
export function moveList(blocs: Bloc[], id: string, target: string): Bloc[] {
  if (!blocs.some(b => b.id === target)) return blocs;
  return blocs.map(b => ({ ...b, lists: b.id === target ? [...b.lists.filter(x => x !== id), id] : b.lists.filter(x => x !== id) }));
}
export function removeBloc(blocs: Bloc[], id: string, target: string): Bloc[] {
  if (id === target || !blocs.some(b => b.id === target)) return blocs;
  const removed = blocs.find(b => b.id === id);
  return blocs.filter(b => b.id !== id).map(b => b.id === target ? { ...b, lists: [...new Set([...b.lists, ...(removed?.lists ?? [])])] } : b);
}
