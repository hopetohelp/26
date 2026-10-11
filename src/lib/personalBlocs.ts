import type { Bloc } from "./crowdApi";
import { seatsFmt } from "./format";

export interface BlocImputation {
  id: string;
  value: number;
  sources: { id: string; date: string; label: string }[];
  method: "same-firm" | "mean";
}
export interface BlocRow extends Bloc {
  missing: string[];
  /** סכום המקור נשאר חסר אם חסר רכיב; האומדן לעולם אינו מחליף אותו. */
  total: number | null;
  knownTotal: number | null;
  knownCount: number;
  estimate: number | null;
  imputed: BlocImputation[];
  reason?: string;
}
const valid = (n: number | undefined): n is number => Number.isFinite(n) && n! >= 0 && n! <= 120;
export function blocValues(blocs: Bloc[], values: Record<string, number | undefined>, mapping: Record<string, string>): BlocRow[] {
  return blocs.map(b => {
    const lists = [...new Set(b.lists)];
    const known = lists.filter(id => mapping[id] && valid(values[mapping[id]]));
    const missing = lists.filter(id => !known.includes(id));
    const knownTotal = known.length ? [...new Set(known.map(id => mapping[id]))].reduce((n, id) => n + values[id]!, 0) : null;
    return { ...b, lists, missing, knownTotal, knownCount: known.length, total: missing.length || !lists.length ? null : knownTotal, estimate: null, imputed: [] };
  });
}

/** משפחה היסטורית נספרת רק כשהגוש מכיל את כל רכיביה הנוכחיים, וכל רשימת עבר נספרת פעם אחת. */
export function historicalBlocValues(blocs: Bloc[], families: { k26: string[]; k25: string[] }[], values: Record<string, number>): BlocRow[] {
  return blocs.map(b => {
    const lists = [...new Set(b.lists)];
    const complete = families.filter(f => f.k26.length > 0 && f.k26.every(id => lists.includes(id)) && f.k25.length > 0 && f.k25.every(name => valid(values[name])));
    const missing = lists.filter(id => !complete.some(f => f.k26.includes(id)));
    const previous = [...new Set(complete.flatMap(f => f.k25))];
    const knownTotal = previous.length ? previous.reduce((n,name) => n + values[name],0) : null;
    return { ...b, lists, missing, knownTotal, knownCount: lists.length - missing.length, total: !lists.length || missing.length ? null : knownTotal, estimate: null, imputed: [] };
  });
}
/**
 * מספר הגוש כפי שמוצג. סכום חלקי (חסרה מפלגה) נכתב כמספר בלי מילת הסבר (הכרעת בעלים 11.10.2026, "בלי 'לפחות'"):
 * החסר מסומן בנפרד מתחת למספר ("חסר 1/3 מפלגות"). `fmt` — עיצוב המספר (מנדטים כברירת מחדל; אחוזים במסך שמציג אחוזים).
 */
export function formatBlocValue(row?: BlocRow, fmt: (n: number) => string = seatsFmt): string {
  if (!row) return "—";
  if (row.total !== null) return fmt(row.total);
  if (row.estimate !== null) return `כ-${fmt(row.estimate)}`;
  if (row.knownTotal !== null) return fmt(row.knownTotal);
  return "—";
}
/** הערך שמשווים בין שני מקורות: מלא, אומדן, ובהיעדרם הסכום הידוע (חלקי); null כשאין שום נתון */
export const blocComparable = (row?: BlocRow): number | null => row ? row.total ?? row.estimate ?? row.knownTotal : null;
