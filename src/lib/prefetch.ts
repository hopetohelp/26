import { keepCall } from "./crowdApi";
import { surveysPath, surveyStatsPath, type Survey } from "./surveys";

/**
 * טעינה מראש למנהל קבוצה (הכרעת בעלים 03.11.2026): כל מה שמסך "ניהול קבוצה" והסטטיסטיקות מציגים נקרא ברקע
 * ונשמר במכשיר (keepCall), כך שבכניסה למסך הנתונים מוצגים מיד ומתרעננים ברקע. כשל — שקט; המסך יטען כרגיל.
 */
export async function prefetchManager(token: string, groups: string[]): Promise<void> {
  const q = encodeURIComponent;
  const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
  await Promise.all(groups.flatMap((g) => ["series", "insights", "stats", "link-members", "outlier-filter"].map((x) => quiet(keepCall(`/group/${x}?group=${q(g)}`, token)))));
  const list = await keepCall<{ surveys: Survey[] }>(surveysPath, token).catch(() => null);
  for (const s of list?.surveys ?? []) if (s.manage) await quiet(keepCall(surveyStatsPath(s.id), token));
}
