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
// הרשמה אמיתית נבדקת בבדיקות האוטומטיות של השרת (worker/crowd/test), לא כאן — כדי לא ליצור משתתפים בייצור.
if (failed) {
  console.log(`\n${failed} בדיקות נכשלו`);
  process.exit(1);
}
console.log("\nהכול תקין");
