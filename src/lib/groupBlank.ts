import type { Dashboard, SeatStat } from "./crowdApi";

/**
 * מסך קבוצה מתחת לסף (הכרעת בעלים 12.10.2026, docs/פילוח-קבוצות-תכנון.md סעיף 10): המסך מוצג כולו, אבל בלי שום נתון של הקבוצה —
 * בטורי "משתתפים" מוצג 0, ורק המונה "N משתתפים" הוא הספירה האמיתית. השרת לא שולח נתונים מתחת לסף (רק את הספירה),
 * והמסך נבנה כאן מאותם רכיבים של המסך הרגיל (מקור אחד), עם ערכי אפס.
 */
export const blankStat = (list: string, n: number): SeatStat => ({ list, n, mean: 0, min: 0, max: 0, median: 0, p25: 0, p75: 0 });

/** שורות הרשימות: אותן רשימות שבטבלת כלל המשתתפים, בסדר ממוצע הסקרים (הסדר בין אפסים נקבע לפי הסקרים) */
export function blankDashboard(count: number, lists: string[], polls: Record<string, number>, pollsAsOf: string | null): Dashboard {
  const ordered = [...lists].sort((a, b) => (polls[b] ?? 0) - (polls[a] ?? 0));
  const full = ordered.map((id) => blankStat(id, count));
  return {
    publishedAt: null,
    aggregationId: null,
    participants: count,
    open: true,
    sectionParticipants: { vote2026: count },
    blocs: { derived: null, explicit: null, customCount: 0 },
    seats: { n: count, full, everPassedLists: ordered, manual: [], filledShare: 0, usedFillAll: 0, pollsAsOf, polls, starts: { zero: 0, k25: 0, polls: 0 } },
  } as Dashboard;
}

/** הרשימות להצגה כשאין נתון כללי: אלה שבסקרים עוברות 4 מנדטים בממוצע */
export const listsFromPolls = (polls: Record<string, number>) => Object.keys(polls).filter((id) => polls[id] >= 4);
