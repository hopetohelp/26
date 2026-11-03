/** רישום שמירת האתר במכשיר (public/sw.js) — רק באתר המפורסם, לא בפיתוח ובבדיקות. */
export function registerOffline(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    // גרסת שמירה חדשה נכנסה לפעולה (והעותקים הישנים נמחקו) ⇐ רענון אחד לגרסה העדכנית (הכרעת בעלים 03.11.2026).
    // רק כשכבר הייתה שמירה קודמת — בכניסה הראשונה אין רענון
    const had = !!navigator.serviceWorker.controller;
    let done = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !done) { done = true; location.reload(); } });
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* בלי שמירה במכשיר — האתר עובד כרגיל */ });
  });
}
