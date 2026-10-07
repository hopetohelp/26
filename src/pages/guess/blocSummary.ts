import type { BlocsPayload } from "../../lib/crowdApi";

export interface BlocTotal {
  name: string;
  total: number;
}

/**
 * סיכום הגושים לתמונת השיתוף: שם הגוש וסכום המנדטים של רשימותיו בהשערה.
 * מוצג רק אם נקבע יעד לפחות לגוש אחד ("אם יש") ויש רשימות בגוש.
 */
export function blocSummary(blocs: BlocsPayload | null, values: Record<string, number>): BlocTotal[] | undefined {
  if (!blocs || !blocs.blocs.some((b) => b.target !== null)) return undefined;
  const out = blocs.blocs.filter((b) => b.lists.length > 0).map((b) => ({ name: b.name, total: b.lists.reduce((a, id) => a + (values[id] ?? 0), 0) }));
  return out.length ? out : undefined;
}
