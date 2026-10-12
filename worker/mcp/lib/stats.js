/**
 * דשבורד שרת ה-MCP למנהל האתר וכפתור הכיבוי של הכתובת הציבורית (הכרעת בעלים 12.10.2026).
 * לכל יום ולכל כתובת (public — בלי התחברות, mcp — עם התחברות):
 *   חיבורים — כמה חיבורים שונים פנו באותו יום (חיבור = עוזר מחובר לחשבון, או כתובת רשת בכתובת הציבורית; גיבוב בלבד)
 *   שיחות   — רצף קריאות מאותו חיבור בלי הפסקה של 30 דקות
 *   קריאות  — קריאות לכלים שקוראים נתונים · כתיבות — קריאות לכלים שמשנים (שמירה, תשובה, מחיקה…)
 * אין כאן מזהה משתמש, כתובת או תוכן.
 */
const SESSION_GAP = 30 * 60 * 1000;
const day = (t) => new Date(t).toISOString().slice(0, 10);

export async function track(env, { mode, key, reads, writes }, now) {
  try {
    const prev = await env.DB.prepare("SELECT last_at FROM seen WHERE key = ?").bind(key).first();
    const d = day(now);
    const inc = (metric, n) => env.DB.prepare("INSERT INTO stats (day, mode, metric, n) VALUES (?, ?, ?, ?) ON CONFLICT(day, mode, metric) DO UPDATE SET n = n + excluded.n").bind(d, mode, metric, n);
    const stmts = [env.DB.prepare("INSERT INTO seen (key, last_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET last_at = excluded.last_at").bind(key, now)];
    if (!prev || day(prev.last_at) !== d) stmts.push(inc("connections", 1));
    if (!prev || prev.last_at < now - SESSION_GAP) stmts.push(inc("sessions", 1));
    if (reads) stmts.push(inc("reads", reads));
    if (writes) stmts.push(inc("writes", writes));
    await env.DB.batch(stmts);
  } catch { /* הדשבורד אינו מפיל קריאה */ }
}

// ---- הכתובת הציבורית: פתוחה או כבויה. מטמון קצר בזיכרון, כדי שכל קריאה לא תקרא מהמאגר
let cached = null;
export async function publicEnabled(env, now) {
  if (cached && cached.at > now - 30_000) return cached.on;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE name = 'public_enabled'").first().catch(() => null);
  const on = row ? row.value === "1" : true;
  cached = { at: now, on };
  return on;
}
export async function setPublicEnabled(env, on, now) {
  await env.DB.prepare("INSERT INTO settings (name, value, updated_at) VALUES ('public_enabled', ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(on ? "1" : "0", new Date(now).toISOString()).run();
  cached = { at: now, on };
}
export const resetSettingsCache = () => { cached = null; };

/** המספרים למגירה במסך הניהול: 14 הימים האחרונים לכל כתובת, סיכום, חיבורים פעילים, והכלים הנפוצים */
export async function dashboard(env, now) {
  const since = day(now - 13 * 86400000);
  const { results: rows } = await env.DB.prepare("SELECT day, mode, metric, n FROM stats WHERE day >= ? ORDER BY day DESC").bind(since).all();
  const empty = () => ({ connections: 0, sessions: 0, reads: 0, writes: 0 });
  const byDay = new Map();
  const totals = { public: empty(), mcp: empty() };
  for (const r of rows || []) {
    if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day, public: empty(), mcp: empty() });
    byDay.get(r.day)[r.mode][r.metric] = r.n;
    totals[r.mode][r.metric] += r.n;
  }
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE expires_at > ?").bind(new Date(now).toISOString()).first();
  const { results: tools } = await env.DB.prepare("SELECT tool, mode, SUM(n) AS n FROM usage WHERE day >= ? GROUP BY tool, mode ORDER BY n DESC LIMIT 15").bind(since).all();
  return {
    publicEnabled: await publicEnabled(env, now),
    activeConnections: active?.n ?? 0,
    days: [...byDay.values()],
    totals,
    tools: tools || [],
    since,
  };
}

export async function cleanupStats(env, now) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM seen WHERE last_at < ?").bind(now - 2 * 86400000),
    env.DB.prepare("DELETE FROM stats WHERE day < ?").bind(day(now - 90 * 86400000)),
    env.DB.prepare("DELETE FROM usage WHERE day < ?").bind(day(now - 90 * 86400000)),
  ]);
}
