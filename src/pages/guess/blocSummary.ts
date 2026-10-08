import type { BlocsPayload } from "../../lib/crowdApi";

export interface BlocTotal {
  name: string;
  total: number;
  lists: string[];
}

/**
 * סיכום הגושים לתמונת השיתוף: שם הגוש וסכום המנדטים של רשימותיו בהשערה.
 * מוצג לכל גוש עם רשימות, גם בלי יעד מספרי. הגושים עצמאיים וחופפים.
 */
export function blocSummary(blocs: BlocsPayload | null, values: Record<string, number>): BlocTotal[] | undefined {
  if (!blocs) return undefined;
  const out = blocs.blocs.filter((b) => b.lists.length > 0).map((b) => ({ name: b.name, lists: [...b.lists], total: b.lists.reduce((a, id) => a + (values[id] ?? 0), 0) }));
  return out.length ? out : undefined;
}

/** הגוש הגדול לפי סכום המנדטים בפועל; בשוויון נשמר סדר הגושים של המשתתף. */
export function largestBloc(blocs: BlocTotal[] | undefined): BlocTotal | undefined {
  return blocs?.filter(b => b.lists.length > 0).reduce<BlocTotal | undefined>((best, b) => !best || b.total > best.total ? b : best, undefined);
}
