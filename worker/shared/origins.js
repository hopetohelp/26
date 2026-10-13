/** רשימה מדויקת של מקורות דפדפן. ALLOWED_ORIGIN נשארת כגיבוי לבדיקות ולפריסות ותיקות. */
export function allowedOrigin(env, origin) {
  if (!origin) return false;
  const origins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim());
  return origins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);
}

/** כתובת חזרה לאימות לפי האתר שהתחיל את הבקשה, מתוך שתי כתובות ידועות בלבד. */
export function returnSiteUrl(env, origin) {
  if (origin === "https://hopetohelp.github.io" && allowedOrigin(env, origin)) return "https://hopetohelp.github.io/26/";
  if (origin === "https://26.hopetohelp.net" && allowedOrigin(env, origin)) return "https://26.hopetohelp.net/";
  return env.SITE_URL || "https://26.hopetohelp.net/";
}
