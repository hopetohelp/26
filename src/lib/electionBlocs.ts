/**
 * שיוך הרשימות לארבעת הגושים של האתר (נתניהו · חרדים · ערבים · אייזנקוט), לכל מערכת — מקור אחד לכרטיס הגושים במסך "תוצאות"
 * ולטבלאות ולמגמות במסך "סקרים" (electionData). קובץ קל, בלי נתוני הסקרים הישנים.
 * 2026 — SIMPLE_BLOCS; 2022 — השיוך של "מה השתנה" (bloc2022); מערכת אחרת — שדה `blocs` ב־results.json כשסשן ד יוסיף אותו
 * (`{ "netanyahu": ["מחל", …], "haredi": [...], "arab": [...], "eisenkot": [...] }`, באותיות של אותה מערכת). אין שיוך ⇐ null.
 */
import { results } from "./data";
import { SIMPLE_BLOCS, type BlocDef } from "./simpleSources";
import { bloc2022 } from "./voterFlow";
import { K26_ID } from "./election";

type WithBlocs = { id: string; knesset: number; lists: { letters: string }[]; blocs?: Record<string, string[]>; predecessorBlocs?: Record<string, string[]> };

export function blocAssignment(id: string): readonly BlocDef[] | null {
  if (id === K26_ID) return SIMPLE_BLOCS;
  const e = (results as unknown as WithBlocs[]).find((x) => x.id === id);
  if (!e) return null;
  // מפלגות־קודמות מהסקרים שלפני הגשת הרשימות (raw/blocs.json, "predecessors"; הכרעת בעלים 04.11.2026) — בשמן, באותו גוש
  const pre = (id: string) => e.predecessorBlocs?.[id] ?? [];
  if (e.blocs) return SIMPLE_BLOCS.map((b) => ({ ...b, lists: [...(e.blocs![b.id] ?? []), ...pre(b.id)] }));
  if (e.knesset === 25) return SIMPLE_BLOCS.map((b) => ({ ...b, lists: [...e.lists.filter((l) => bloc2022(l.letters) === b.id).map((l) => l.letters), ...pre(b.id)] }));
  return null;
}
