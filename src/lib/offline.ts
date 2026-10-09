/** רישום שמירת האתר במכשיר (public/sw.js) — רק באתר המפורסם, לא בפיתוח ובבדיקות. */
export function registerOffline(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* בלי שמירה במכשיר — האתר עובד כרגיל */ });
  });
}
