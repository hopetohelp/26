// בדיקת בריאות של שרתי האתר (נקראת מ-.github/workflows/health.yml כל חצי שעה, ואפשר גם ידנית: node scripts/health-check.mjs).
// בודקת מבחוץ, כמו דפדפן של גולש: בדיקת חיבור, CORS, דשבורד, ושגיאות צפויות (בלי ליצור משתתפים או הערות).
// כל כשל מדפיס שורה ומסיים בקוד 1 — ואז GitHub שולח התראה לבעלים.
const ORIGIN = "https://hopetohelp.github.io";
const FEEDBACK = process.env.FEEDBACK_URL ?? "https://elections26-feedback.hopetohelp-il.workers.dev";
const CROWD = process.env.CROWD_URL ?? "https://elections26-crowd.hopetohelp-il.workers.dev";

const checks = [
  ["ping שרת ההערות", FEEDBACK + "/ping", {}, 200],
  ["ping שרת ההשתתפות דרך שרת ההערות", FEEDBACK + "/crowd/ping", {}, 200],
  ["ping שרת ההשתתפות ישירות", CROWD + "/ping", {}, 200],
  ["POST ping עם גוף (כמו הרשמה)", FEEDBACK + "/crowd/ping", { method: "POST", body: { username: "probe", password: "probe-pass" } }, 200],
  ["דשבורד", FEEDBACK + "/crowd/dashboard", {}, 200],
  ["הרשמה לא תקינה נדחית בשגיאה ולא בכשל רשת", FEEDBACK + "/crowd/auth/register", { method: "POST", body: { username: "x", password: "y" } }, 400],
  ["שמירה בלי סשן נדחית", FEEDBACK + "/crowd/save", { method: "POST", body: { unit: "seats" } }, 401],
  ["שמירה בלי סשן נדחית (ישירות)", CROWD + "/save", { method: "POST", body: { unit: "seats" } }, 401],
];

let failed = 0;
for (const [name, url, opts, want] of checks) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { origin: ORIGIN, ...(opts.body ? { "content-type": "application/json" } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const cors = res.headers.get("access-control-allow-origin");
    const ms = Date.now() - started;
    const problems = [];
    if (res.status !== want) problems.push(`סטטוס ${res.status}, נדרש ${want}`);
    if (cors !== ORIGIN) problems.push(`כותרת CORS ${cors ?? "חסרה"}`);
    if (ms > 8000) problems.push(`איטי: ${ms}ms`);
    if (problems.length) {
      failed++;
      console.log(`❌ ${name}: ${problems.join("; ")}`);
    } else console.log(`✅ ${name} (${ms}ms)`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
// הנתונים הפתוחים באתר החי (data/index.json, llms.txt): כל קובץ שבאינדקס עונה, עטוף ב-about, ולא ישן מ-36 שעות
// (הפרסום רץ כל 4 שעות; בשבת אין פרסום — מיום שישי 16:00 עד מוצאי שבת 20:00 — ולכן הסף רחב מהפער הארוך ביותר).
const SITE = process.env.SITE_URL ?? "https://hopetohelp.github.io/26/";
const MAX_AGE_H = 36;
try {
  const idx = await (await fetch(SITE + "data/index.json", { signal: AbortSignal.timeout(15000) })).json();
  const age = (Date.now() - Date.parse(idx.about.updatedAt)) / 3_600_000;
  if (!(age <= MAX_AGE_H)) { failed++; console.log(`❌ האינדקס ישן: ${idx.about.updatedAt}`); } else console.log(`✅ אינדקס הנתונים (${age.toFixed(1)} שעות)`);
  const llms = await fetch(SITE + "llms.txt", { signal: AbortSignal.timeout(15000) });
  if (!llms.ok) { failed++; console.log(`❌ llms.txt: סטטוס ${llms.status}`); } else console.log("✅ llms.txt");
  for (const f of idx.files) {
    try {
      const res = await fetch(f.url, { signal: AbortSignal.timeout(20000) });
      const d = await res.json();
      if (!res.ok || !d.about?.updatedAt || !d.about?.method) { failed++; console.log(`❌ ${f.path}: חסר או בלי about`); } else console.log(`✅ ${f.path}`);
    } catch (e) { failed++; console.log(`❌ ${f.path}: ${e instanceof Error ? e.message : e}`); }
  }
} catch (e) {
  failed++;
  console.log(`❌ אינדקס הנתונים: ${e instanceof Error ? e.message : e}`);
}
// שרת ה-MCP (worker/mcp): מסך הגילוי של ההתחברות, והכתובת הציבורית עונה עם רשימת הכלים
const MCP = process.env.MCP_URL ?? "https://elections26-mcp.hopetohelp-il.workers.dev";
try {
  const meta = await fetch(MCP + "/.well-known/oauth-authorization-server", { signal: AbortSignal.timeout(15000) });
  const list = await fetch(MCP + "/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), signal: AbortSignal.timeout(15000) });
  const tools = list.ok ? (await list.json()).result?.tools?.map((t) => t.name) ?? [] : [];
  if (!meta.ok || !tools.includes("calculate_seats")) { failed++; console.log(`❌ שרת ה-MCP: גילוי ${meta.status}, כלים ${list.status}`); } else console.log(`✅ שרת ה-MCP (${tools.length} כלים ציבוריים)`);
} catch (e) {
  failed++;
  console.log(`❌ שרת ה-MCP: ${e instanceof Error ? e.message : e}`);
}
// הרשמה אמיתית נבדקת בבדיקות האוטומטיות של השרת (worker/crowd/test), לא כאן — כדי לא ליצור משתתפים בייצור.
if (failed) {
  console.log(`\n${failed} בדיקות נכשלו`);
  process.exit(1);
}
console.log("\nהכול תקין");
