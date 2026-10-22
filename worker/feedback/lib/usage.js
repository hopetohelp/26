/** מקור אחד למונים הציבוריים ולניהול. totalVisitors = דפדפנים ייחודיים (״נכנסו״, גם בבית); totalVisits = צפיות בעמודים (בניהול בלבד). */
export async function usageTotals(db) {
  return db.prepare("SELECT (SELECT COUNT(*) FROM visitors_all) AS totalVisitors, (SELECT COALESCE(SUM(count),0) FROM hits WHERE page NOT LIKE 'diag:%') AS totalVisits").first();
}
