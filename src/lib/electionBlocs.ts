/**
 * שיוך הרשימות לארבעת הגושים של האתר (נתניהו · חרדים · ערבים · אייזנקוט), לכל מערכת — מקור אחד לכרטיס הגושים במסך "תוצאות"
 * ולטבלאות ולמגמות במסך "סקרים" (electionData). קובץ קל, בלי נתוני הסקרים הישנים.
 * 2026 — SIMPLE_BLOCS; 2022 — השיוך של "מה השתנה" (bloc2022); מערכת אחרת — שדה `blocs` ב־results.json כשסשן ד יוסיף אותו
 * (`{ "netanyahu": ["מחל", …], "haredi": [...], "arab": [...], "eisenkot": [...] }`, באותיות של אותה מערכת). אין שיוך ⇐ null.
 */
import { activeLists2026, results } from "./data";
import { SIMPLE_BLOCS, type BlocDef } from "./simpleSources";
import { bloc2022, bloc2026 } from "./voterFlow";
import blocsFile from "../../raw/blocs.json";
import { K26_ID } from "./election";
import { LIST_LEADERS } from "./listLeaders";

type WithBlocs = { id: string; knesset: number; lists: { letters: string; seats?: number }[]; blocs?: Record<string, string[]>; predecessorBlocs?: Record<string, string[]> };

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

/**
 * 2026 — מפלגות־קודמות מהסקרים שלפני הגשת הרשימות (כלל ברזל 8, הכרעת בעלים 04.11.2026): הרשימות הממשיכות ב-raw/blocs.json ("26"),
 * והגוש — של הרשימות הממשיכות לפי BLOC_MEMBERS (bloc2026, מקור אחד), רק כשכולן באותו גוש. רשימה שפרשה (withdrawn) אינה בגוש.
 */
type Pre26 = Record<string, { successors: string[]; bloc: string | null }>;
const PRE_2026 = (blocsFile as unknown as { elections: { "26": { predecessors: Pre26 } } }).elections["26"].predecessors;
const active26 = new Set(activeLists2026.map((l) => l.id));
export function predecessorBloc2026(id: string): string | null {
  const s = PRE_2026[id]?.successors ?? [];
  const blocs = new Set(s.map((x) => (active26.has(x) ? bloc2026(x) : null)));
  return s.length && blocs.size === 1 && !blocs.has(null) ? [...blocs][0] : null;
}
export const PREDECESSORS_2026 = Object.keys(PRE_2026);
let blocs26: readonly BlocDef[] | null = null;
const k26Blocs = () => blocs26 ??= SIMPLE_BLOCS.map((b) => ({ ...b, lists: [...b.lists, ...PREDECESSORS_2026.filter((p) => predecessorBloc2026(p) === b.id)] }));

export function blocAssignment(id: string): readonly BlocDef[] | null {
  // 2026: ראשי הרשימות הגדולות — הליכוד (נתניהו) ו"ישר!" (אייזנקוט), כבר בשמות של SIMPLE_BLOCS; ועוד המפלגות־הקודמות
  if (id === K26_ID) return k26Blocs();
  // 2009 (אינה בבורר) — previous של 2013, למעבר בין גושים 2009⇐2013
  const all = results as unknown as (WithBlocs & { previous?: Omit<WithBlocs, "id"> })[];
  const p = all.find((x) => x.previous && `k${x.previous.knesset}` === id)?.previous;
  const e = all.find((x) => x.id === id) ?? (p ? { ...p, id } : undefined);
  if (!e) return null;
  // מפלגות־קודמות מהסקרים שלפני הגשת הרשימות (raw/blocs.json, "predecessors"; הכרעת בעלים 04.11.2026) — בשמן, באותו גוש
  const pre = (id: string) => e.predecessorBlocs?.[id] ?? [];
  if (e.blocs) return named(e, SIMPLE_BLOCS.map((b) => ({ ...b, lists: [...(e.blocs![b.id] ?? []), ...pre(b.id)] })));
  if (e.knesset === 25) return named(e, SIMPLE_BLOCS.map((b) => ({ ...b, lists: [...e.lists.filter((l) => bloc2022(l.letters) === b.id).map((l) => l.letters), ...pre(b.id)] })));
  return null;
}
