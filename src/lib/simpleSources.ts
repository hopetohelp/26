import { CURRENT_POLLS, resolveData, type Selection } from "./dataResolver";
import type { Poll } from "./data";
/** אומת ב־GET /group/public?slug=hagzara ב־23.10.2026. חברות נאכפת בשרת. */
export const HAGZARA_GROUP_ID = "gy7lelpbo";
export const SIMPLE_ALL: Selection = { product: "polls.mean" };
export const SIMPLE_14_24: Selection = { product: "polls.mean", publishers: ["Channel 14", "i24 News"] };
export function simpleFirmOptions(input: Poll[]) {
  return [...new Map(input.map(p => [p.firm, { id: p.firm, name: p.firmHe }])).values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
}
export const SIMPLE_FIRMS = simpleFirmOptions(CURRENT_POLLS);
export function simpleSelection(key: string): Selection {
  if (key === "14-24") return SIMPLE_14_24;
  if (key.startsWith("firm:") && SIMPLE_FIRMS.some(f => `firm:${f.id}` === key)) return { product: "poll.single", source: key };
  return SIMPLE_ALL;
}
export const simpleValue = (selection: Selection, ids: string[]) => resolveData(selection, ids, "community").value;
