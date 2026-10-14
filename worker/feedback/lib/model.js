/**
 * קריאה לספק ה-AI (Google Gemini או Anthropic) ונתוני האתר הציבוריים כהקשר — משותף לתשובות האוטומטיות של האתר (autoReply.js)
 * ולצ'אט הפרטי של משתמש עם מפתח משלו (privateAsk.js).
 *
 * 🔴 הפרדה בין המפתחות והצ'אטים (הכרעת בעלים 14.10.2026): המודול הזה **אינו יודע** מאיפה בא המפתח — מקבל אותו כפרמטר — ואינו נוגע במאגר,
 * ב-`env.DB`, בהגדרות או בסוד השרת. הקשר השיחה הוא נתוני האתר הציבוריים בלבד (אותם קבצים לכל אחד). בדיקת מבנה ב-test/separation.test.js
 * נכשלת אם מודול זה או privateAsk.js מתחילים להזכיר מאגר, מפתח האתר או את הסקירה.
 */
export const SITE = "https://26.hopetohelp.net";
/** מסכים שמותר לקשר אליהם (HashRouter) */
export const ROUTES = new Set(["", "today", "polls", "changes", "calculator", "past", "method", "community", "support"]);
const DATA_FILES = ["llms.txt", "data/average.json", "data/scenarios.json", "data/forecast.json", "data/law.json"];
const MAX_CONTEXT_PER_FILE = 40000;

/** נתוני האתר הציבוריים כהקשר — נשמרים בזיכרון חצי שעה */
let contextCache = { at: 0, text: "" };
export async function siteContext(fetcher, now) {
  if (contextCache.text && now - contextCache.at < 30 * 60 * 1000) return contextCache.text;
  const parts = [];
  for (const file of DATA_FILES) {
    const r = await fetcher(`${SITE}/${file}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r?.ok) { if (file === "llms.txt" || file === "data/average.json") throw new Error("context"); continue; }
    parts.push(`### ${file}\n${(await r.text()).slice(0, MAX_CONTEXT_PER_FILE)}`);
  }
  contextCache = { at: now, text: parts.join("\n\n") };
  return contextCache.text;
}

/**
 * קריאה אחת למודל. הספק נקבע לפי צורת המפתח. turns = [{role: "user"|"assistant", text}] (מתחיל ונגמר ב-user).
 * models = { gemini, anthropic } (אופציונלי). המפתח נשלח אך ורק לכתובת הספק שלו, ולעולם לא נכלל בשגיאה.
 * שגיאה: Error("model_<סטטוס>") עם provider, model ו-status.
 */
export async function callProvider(models, fetcher, key, { system, turns, json = false }) {
  const anthropic = key.startsWith("sk-ant-");
  const provider = anthropic ? "anthropic" : "gemini";
  // ברירת מחדל של Gemini שאינה זמינה בחשבון (404) ⇐ ניסיון אחד עם הכינוי העדכני; מודל שנקבע במפורש אינו מוחלף
  const candidates = anthropic ? [models?.anthropic || "claude-haiku-5-5"] : models?.gemini ? [models.gemini] : ["gemini-2.5-flash", "gemini-flash-latest"];
  let failure;
  for (const model of candidates) {
    const [url, auth, body] = anthropic
      ? ["https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" },
        { model, max_tokens: 1024, system, messages: turns.map((t) => ({ role: t.role, content: t.text })) }]
      : [`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { "x-goog-api-key": key },
        { systemInstruction: { parts: [{ text: system }] }, contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096, ...(json ? { responseMimeType: "application/json" } : {}) } }];
    const r = await fetcher(url, { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    if (!r.ok) { failure = Object.assign(new Error(`model_${r.status}`), { provider, model, status: r.status }); if (r.status === 404) continue; throw failure; }
    const data = await r.json().catch(() => ({}));
    const text = anthropic ? data.content?.map((c) => c.text).join("") : data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("");
    return { text: text || "", provider, model };
  }
  throw failure;
}
