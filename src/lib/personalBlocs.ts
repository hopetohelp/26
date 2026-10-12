import type { Bloc } from "./crowdApi";
import { seatsFmt } from "./format";
import { groupSeatsIn, sumPresent, type Poll } from "./data";

/**
 * שורת גוש: `total` = הסכום לפי הכלל האחד (`sumPresent`, הכרעת בעלים 12.10.2026) — מפלגה שאין לה נתון נספרת 0 בלי שום סימון;
 * `null` רק כשאין נתון לאף מפלגה בגוש.
 */
export interface BlocRow extends Bloc {
  total: number | null;
}
const valid = (n: number | undefined): n is number => Number.isFinite(n) && n! >= 0 && n! <= 120;
export function blocValues(blocs: Bloc[], values: Record<string, number | undefined>, mapping: Record<string, string>): BlocRow[] {
  return blocs.map(b => {
    const lists = [...new Set(b.lists)];
    const mapped = [...new Set(lists.filter(id => mapping[id]).map(id => mapping[id]))];
    return { ...b, lists, total: sumPresent(mapped.map(id => valid(values[id]) ? values[id] : undefined)) };
  });
}

/** גושים בסקר אחד: אותו כלל, על הערכים של הסקר (`groupSeatsIn`) */
export function pollBlocValues(blocs: Bloc[], poll: Poll): BlocRow[] {
  return blocs.map(b => { const lists = [...new Set(b.lists)]; return { ...b, lists, total: groupSeatsIn(poll, lists) }; });
}

/** משפחה היסטורית נספרת רק כשהגוש מכיל את כל רכיביה הנוכחיים, וכל רשימת עבר נספרת פעם אחת. */
export function historicalBlocValues(blocs: Bloc[], families: { k26: string[]; k25: string[] }[], values: Record<string, number>): BlocRow[] {
  return blocs.map(b => {
    const lists = [...new Set(b.lists)];
    const complete = families.filter(f => f.k26.length > 0 && f.k26.every(id => lists.includes(id)) && f.k25.length > 0 && f.k25.every(name => valid(values[name])));
    const previous = [...new Set(complete.flatMap(f => f.k25))];
    return { ...b, lists, total: previous.length ? previous.reduce((n, name) => n + values[name], 0) : null };
  });
}
/** מספר הגוש כפי שמוצג: בלי סימן חסר (הכרעת בעלים 12.10.2026). `fmt` — עיצוב המספר (מנדטים כברירת מחדל; אחוזים במסך שמציג אחוזים). "—" רק כשאין נתון. */
export function formatBlocValue(row?: BlocRow, fmt: (n: number) => string = seatsFmt): string {
  return row?.total != null ? fmt(row.total) : "—";
}
/** הערך שמשווים בין שני מקורות; null כשאין נתון */
export const blocComparable = (row?: BlocRow): number | null => row?.total ?? null;
