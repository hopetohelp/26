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
import { LIST_LEADERS } from "./listLeaders";

type WithBlocs = { id: string; knesset: number; lists: { letters: string; seats?: number }[]; blocs?: Record<string, string[]> };

/** שני הגושים שנקראים על שם אדם — על שם ראש הרשימה הגדולה בגוש באותה מערכת (הכרעת בעלים 04.11.2026); חרדים וערבים — שם תיאורי */
const PERSON_BLOCS = ["netanyahu", "eisenkot"];
function named(e: WithBlocs, blocs: BlocDef[]): BlocDef[] {
  const seats = Object.fromEntries(e.lists.map((l) => [l.letters, l.seats ?? 0]));
  return blocs.map((b) => {
    if (!PERSON_BLOCS.includes(b.id) || !b.lists.length) return b;
    const top = [...b.lists].sort((x, y) => (seats[y] ?? 0) - (seats[x] ?? 0))[0];
    const leader = LIST_LEADERS[e.id]?.[top];
    return leader ? { ...b, name: `גוש ${leader}`, short: leader } : b;
  });
}

export function blocAssignment(id: string): readonly BlocDef[] | null {
  // 2026: ראשי הרשימות הגדולות — הליכוד (נתניהו) ו"ישר!" (אייזנקוט), כבר בשמות של SIMPLE_BLOCS
  if (id === K26_ID) return SIMPLE_BLOCS;
  const e = (results as unknown as WithBlocs[]).find((x) => x.id === id);
  if (!e) return null;
  if (e.blocs) return named(e, SIMPLE_BLOCS.map((b) => ({ ...b, lists: e.blocs![b.id] ?? [] })));
  if (e.knesset === 25) return named(e, SIMPLE_BLOCS.map((b) => ({ ...b, lists: e.lists.filter((l) => bloc2022(l.letters) === b.id).map((l) => l.letters) })));
  return null;
}
