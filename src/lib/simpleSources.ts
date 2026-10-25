import { CURRENT_POLLS, resolveData, selectedPolls, type Selection } from "./dataResolver";
import { CLOSED_LISTS, type Poll } from "./data";
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
/** לא מוצעות לבחירה בעורך "הכנסת שלי" — רשימות שלא עברו באף סקר (CLOSED_LISTS, הכרעת בעלים 24.10.2026); במגירת ההצבעה הן נשארות */
export const SIMPLE_GUESS_HIDDEN = CLOSED_LISTS;
/** הרשימות שנכללות בשני הגרפים: בלי רשימות שלא עברו את החסימה באף סקר (CLOSED_LISTS, הכרעת בעלים 25.10.2026) */
export const BLOC_IDS = IDS.filter(id => !CLOSED_LISTS.includes(id));
const eligible = (ids: string[]) => ids.filter(id => BLOC_IDS.includes(id));
/** ארבעת הגושים של התצוגה הממוקדת (הכרעת בעלים 23.10.2026), בסדר התצוגה: מלמעלה בכיוון השעון. */
const NETANYAHU = eligible(["likud", "otzma", "rzp", "amcha", "noam"]), HAREDI = eligible(["shas", "utj", "code_black", "haredi_public"]), ARAB = eligible(["joint", "raam"]);
export const SIMPLE_BLOCS = [
  { id: "netanyahu", name: "גוש נתניהו", short: "נתניהו", lists: NETANYAHU },
  { id: "haredi", name: "מפלגות חרדיות", short: "חרדים", lists: HAREDI },
  { id: "arab", name: "מפלגות ערביות", short: "ערבים", lists: ARAB },
  { id: "eisenkot", name: "גוש אייזנקוט", short: "אייזנקוט", lists: BLOC_IDS.filter(id => ![...NETANYAHU, ...HAREDI, ...ARAB].includes(id)) },
] as const;
export type BlocDef = { id: string; name: string; short: string; lists: readonly string[] };
/** החלוקה האישית (הכרעת בעלים 25.10.2026): חמשת התאים בסדר התצוגה; "אחדות" (המרכז) = כל יתר הרשימות */
export const PERSONAL_CELLS = [
  { id: "haredi", name: "מפלגות חרדיות", short: "חרדים" },
  { id: "right", name: "ימין", short: "ימין" },
  { id: "unity", name: "אחדות", short: "אחדות" },
  { id: "left", name: "שמאל", short: "שמאל" },
  { id: "arab", name: "מפלגות ערביות", short: "ערבים" },
] as const;
export type PersonalCell = typeof PERSONAL_CELLS[number]["id"];
const PERSONAL_DEFAULT: Record<string, PersonalCell> = Object.fromEntries([...HAREDI.map(id => [id, "haredi"]), ...eligible(["otzma", "rzp"]).map(id => [id, "right"]), ...eligible(["democrats"]).map(id => [id, "left"]), ...ARAB.map(id => [id, "arab"])]);
/** תא ברירת המחדל של רשימה; רשימה שלא שויכה נמצאת ב"אחדות" */
export const defaultCell = (id: string): PersonalCell => PERSONAL_DEFAULT[id] ?? "unity";
/** החלוקה האישית כגושים: כל רשימה זכאית בדיוק בתא אחד. `assign` — שינויי המשתתף מברירת המחדל. */
export function personalBlocs(assign: Record<string, string> = {}): BlocDef[] {
  const cellOf = (id: string) => PERSONAL_CELLS.some(c => c.id === assign[id]) ? assign[id] : defaultCell(id);
  return PERSONAL_CELLS.map(c => ({ ...c, lists: BLOC_IDS.filter(id => cellOf(id) === c.id) }));
}
/** הסכום לגוש מתוך ערכים לכל רשימה */
export const blocTotal = (values: Record<string, number | null | undefined>, lists: readonly string[]) => lists.reduce((s, id) => s + (values[id] ?? 0), 0);
/** האחדות של העוגה הכפולה — קבועה לכולם (הכרעת בעלים 25.10.2026): תא "אחדות" בחלוקה המקורית */
export const UNITY_LISTS = personalBlocs().find(b => b.id === "unity")!.lists;
/** חמש הקבוצות שבכל תצוגת גושים במתקדם (הכרעת בעלים 25.10.2026): ארבעת גושי העוגה הכפולה והאחדות. האחדות חופפת לנתניהו ולאייזנקוט — אין לחבר. */
export const KNESSET_GROUPS = [...SIMPLE_BLOCS.map(b => ({ id: b.id, name: b.short, lists: [...b.lists], target: null })), { id: "unity", name: "אחדות", lists: [...UNITY_LISTS], target: null }];
