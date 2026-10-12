import { bucketLatest, mean, pointTimes, POINT_DAYS, POINT_WINDOW, pollsterKey, type Poll } from "./data";
import { pollBlocValues } from "./personalBlocs";
import type { Bloc } from "./crowdApi";
const DAY = 86400000;

/**
 * ממוצע מתגלגל לכל גוש לאורך זמן. בכל נקודה: הסקר האחרון של כל מכון בחלון, וסכום הגוש בכל סקר לפי הכלל האחד (`pollBlocValues`) —
 * סקר שסקר לפחות מפלגה אחת מהגוש נכנס, מפלגה שלא נסקרה נספרת 0, בלי סימון (הכרעת בעלים 12.10.2026).
 */
export function rollingBlocMean(blocs: Bloc[], source: Poll[], from: string, to: string, days = POINT_WINDOW, minN = 1, step = POINT_DAYS) {
  const projected = source.map(p => ({ end: p.end, key: pollsterKey(p), rows: pollBlocValues(blocs, p) }));
  return blocs.map(b => {
    const points: { t: number; v: number; lo: number; hi: number; xs: number[]; n: number; breakBefore: boolean }[] = [];
    for (const t of pointTimes(from, to, step)) {
      const totals = bucketLatest(projected, p => p.end, p => p.key, t, days).map(p => p.rows.find(r => r.id === b.id)?.total).filter((x): x is number => typeof x === "number");
      if (totals.length < minN || !totals.length) continue;
      points.push({ t, v: mean(totals), lo: Math.min(...totals), hi: Math.max(...totals), xs: totals, n: totals.length, breakBefore: !!points.length && t - points[points.length - 1].t > step * DAY });
    }
    return { id: b.id, name: b.name, points };
  });
}
