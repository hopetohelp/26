import { mergeDailyHourly } from "../../shared/stats.js";

/**
 * הנתונים של שרת ההערות לדשבורד הסטטיסטיקה (הכרעת בעלים 28.10.2026), כאירועים [זמן, משקל].
 * מונה יומי מלפני 28.10 נספר בתחילת היום (UTC); מאז — בשעתו (shared/stats.js mergeDailyHourly).
 */
export async function feedbackStatEvents(db, auto) {
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all().catch(() => null))?.results ?? [];
  const hourly = async (prefix) => (await all("SELECT substr(page, ?) AS k, SUM(count) AS c FROM hits WHERE page LIKE ? GROUP BY page", prefix.length + 1, prefix + "%")).map((r) => [r.k, r.c]);
  const mark = await db.prepare("SELECT value FROM counter_marks WHERE name = 'failures_from'").first().catch(() => null);
  // מוני האבחון — פחות תמונת המצב שנשמרה באיפוס (counter_baseline), כמו בניהול
  const diag = async (kind) => mergeDailyHourly(
    (await all("SELECT h.day, h.count - COALESCE((SELECT b.count FROM counter_baseline b WHERE b.day = h.day AND b.page = h.page), 0) AS c FROM hits h WHERE h.page = ?", "diag:" + kind)).map((r) => [r.day, r.c]),
    await hourly(`diag:${kind}@`),
  );
  const anon = await all("SELECT vh, kind, at FROM video_anon_events");
  const per = new Map();
  for (const r of anon) if (r.kind !== "results") per.set(r.vh, (per.get(r.vh) ?? 0) + 1);
  // סרטונים שנספרו לפני טבלת האירועים (כולם סרטוני ניחוש) — בתחילת יום הסרטון הראשון
  const legacy = (await all("SELECT vh, videos, first_day FROM video_anon")).map((r) => [Date.parse(r.first_day + "T00:00:00Z"), Math.max(0, r.videos - (per.get(r.vh) ?? 0))]).filter(([, w]) => w > 0);
  const at = (t) => [Date.parse(t), 1];
  return {
    pageHits: mergeDailyHourly((await all("SELECT day, SUM(count) AS c FROM hits WHERE page NOT LIKE 'diag:%' GROUP BY day")).map((r) => [r.day, r.c]), await hourly("diag:hit@")),
    pageHitsUser: mergeDailyHourly([], await hourly("diag:hit-u@")),
    browsers: mergeDailyHourly(
      (await all("SELECT first_day AS day, COUNT(*) AS c FROM visitors_all GROUP BY first_day")).map((r) => [r.day, r.c]),
      (await all("SELECT substr(at, 1, 13) AS k, COUNT(*) AS c FROM browser_first GROUP BY k")).map((r) => [r.k, r.c]),
    ),
    failures: (await all("SELECT created_at FROM feedback WHERE text LIKE ? AND created_at >= ?", auto + "%", mark?.value || "")).map((r) => at(r.created_at)),
    blocked: await diag("all-blocked"),
    relaySaved: await diag("relay-saved"),
    blindSaved: await diag("blind-sent"),
    imgGuess: mergeDailyHourly([], await hourly("diag:img-guess@")),
    imgResults: mergeDailyHourly([], await hourly("diag:img-results@")),
    videoGuessAnon: [...anon.filter((r) => r.kind !== "results").map((r) => at(r.at)), ...legacy],
    videoResultsAnon: anon.filter((r) => r.kind === "results").map((r) => at(r.at)),
  };
}
