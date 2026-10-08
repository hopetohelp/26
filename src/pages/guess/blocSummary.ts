import type { BlocsPayload } from "../../lib/crowdApi";

export interface BlocTotal {
  name: string;
  total: number;
}

/**
 * סיכום הגושים לתמונת השיתוף: שם הגוש וסכום המנדטים של רשימותיו בהשערה.
 * מוצג לכל גוש עם רשימות, גם בלי יעד מספרי. הגושים עצמאיים וחופפים.
 */
export function blocSummary(blocs: BlocsPayload | null, values: Record<string, number>): BlocTotal[] | undefined {
  if (!blocs) return undefined;
  const out = blocs.blocs.filter((b) => b.lists.length > 0).map((b) => ({ name: b.name, total: b.lists.reduce((a, id) => a + (values[id] ?? 0), 0) }));
  return out.length ? out : undefined;
}
