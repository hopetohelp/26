import { FEEDBACK_URL } from "./feedback";

/**
 * מונה הכניסות: בכל מעבר עמוד נשלח לשרת ההערות שם העמוד ומזהה אקראי של הדפדפן.
 * הבעלים היחיד של המפתח "elections26.vid" ב-localStorage. המזהה אקראי לגמרי, לא נגזר מאף פרט על הגולש,
 * והשרת שומר רק גיבוב שלו (worker/feedback). מחיקת נתוני האתר בדפדפן יוצרת מזהה חדש.
 */
const KEY = "elections26.vid";

function visitorId(): string | undefined {
  try {
    let v = localStorage.getItem(KEY);
    if (!v || !/^[A-Za-z0-9_-]{16,32}$/.test(v)) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      v = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return undefined; // דפדפן חסום לאחסון — נספר כצפייה בלי מזהה קבוע
  }
}

export function pingVisit(page: string) {
  if (!FEEDBACK_URL) return;
  fetch(`${FEEDBACK_URL}/hit`, { method: "POST", body: JSON.stringify({ page, v: visitorId() }), keepalive: true }).catch(() => {});
}
