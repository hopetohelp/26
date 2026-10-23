import { CURRENT_POLLS, resolveData, selectedPolls, type Selection } from "./dataResolver";
import type { Poll } from "./data";
import { pollSeatValues } from "./pollRange";
import { IDS } from "../pages/guess/model";
/** אומת ב־GET /group/public?slug=hagzara ב־23.10.2026. חברות נאכפת בשרת. */
export const HAGZARA_GROUP_ID = "gy7lelpbo";
/** התצוגה הממוקדת: רק סקרים מהשבועיים האחרונים (הכרעת בעלים 23.10.2026). */
export const SIMPLE_DAYS = 14;
export const SIMPLE_ALL: Selection = { product: "polls.mean", days: SIMPLE_DAYS };
export const SIMPLE_14_24: Selection = { product: "polls.mean", days: SIMPLE_DAYS, publishers: ["Channel 14", "i24 News"] };
export function simpleFirmOptions(input: Poll[]) {
  return [...new Map(input.map(p => [p.firm, { id: p.firm, name: p.firmHe }])).values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
}
export const SIMPLE_FIRMS = simpleFirmOptions(CURRENT_POLLS);
export function simpleSelection(key: string): Selection {
  if (key === "14-24") return SIMPLE_14_24;
  if (key.startsWith("firm:") && SIMPLE_FIRMS.some(f => `firm:${f.id}` === key)) return { product: "poll.single", source: key, days: SIMPLE_DAYS };
  return SIMPLE_ALL;
}
export const simpleValue = (selection: Selection, ids: string[]) => resolveData(selection, ids, "community").value;
/** פיזור הסקרים שבבחירה לכל רשימה: מינימום, אחוזונים 10/25/75/90 ומקסימום — לקפסולה (סולם המחקר המתקדם). */
export function simpleSpread(selection: Selection, id: string): [number, number, number, number, number, number] | null {
  const v = pollSeatValues(selectedPolls(selection), [id]).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (x: number) => v[Math.min(v.length - 1, Math.round(x * (v.length - 1)))];
  return [v[0], q(.1), q(.25), q(.75), q(.9), v[v.length - 1]];
}
/** ארבעת הגושים של התצוגה הממוקדת (הכרעת בעלים 23.10.2026), בסדר התצוגה: מלמעלה בכיוון השעון. */
const NETANYAHU = ["likud", "otzma", "rzp", "amcha", "noam"], HAREDI = ["shas", "utj", "code_black", "haredi_public"], ARAB = ["joint", "raam"];
export const SIMPLE_BLOCS = [
  { id: "netanyahu", name: "גוש נתניהו", short: "נתניהו", lists: NETANYAHU },
  { id: "haredi", name: "מפלגות חרדיות", short: "חרדים", lists: HAREDI },
  { id: "arab", name: "מפלגות ערביות", short: "ערבים", lists: ARAB },
  { id: "eisenkot", name: "גוש אייזנקוט", short: "אייזנקוט", lists: IDS.filter(id => ![...NETANYAHU, ...HAREDI, ...ARAB].includes(id)) },
] as const;
/** הסכום לגוש מתוך ערכים לכל רשימה */
export const blocTotal = (values: Record<string, number | null | undefined>, lists: readonly string[]) => lists.reduce((s, id) => s + (values[id] ?? 0), 0);
