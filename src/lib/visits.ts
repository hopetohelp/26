import { FEEDBACK_URL } from "./feedback";
import { call } from "./crowdApi";

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

/**
 * דפדפן הבעלים (הכרעת בעלים 11.10.2026): כניסות ממנו לא נשלחות לשרת כלל, כדי שלא יתערבבו בסטטיסטיקה.
 * הסימון נשמר רק בדפדפן הזה (localStorage) ואינו נשלח לשום מקום. הפעלה: לפתוח את האתר עם ?nocount=1 (ביטול: ?nocount=0),
 * או אוטומטית אחרי פתיחה מוצלחת של מסך הניהול. מחיקת נתוני האתר בדפדפן מבטלת את הסימון.
 */
const OWNER_KEY = "elections26.noCount";

export function setOwnerBrowser(on: boolean) {
  try { if (on) localStorage.setItem(OWNER_KEY, "1"); else localStorage.removeItem(OWNER_KEY); } catch { /* בלי אחסון — אין סימון */ }
}

export function isOwnerBrowser(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  const flag = new URLSearchParams(search).get("nocount");
  if (flag === "1") setOwnerBrowser(true);
  else if (flag === "0") setOwnerBrowser(false);
  try { return localStorage.getItem(OWNER_KEY) === "1"; } catch { return false; }
}

export function pingVisit(page: string) {
  if (!FEEDBACK_URL) return;
  if (isOwnerBrowser()) return;
  fetch(`${FEEDBACK_URL}/hit`, { method: "POST", body: JSON.stringify({ page, v: visitorId() }), keepalive: true }).catch(() => {});
}

/**
 * סרטון נוצר (הכרעת בעלים 26.10.2026) — לכרטיס הסטטיסטיקה של מנהלי האתר והקבוצות. נשלחים רק שני סימונים:
 * האם נוסף הניחוש שלי והאם נכתב שם — לא השם, לא הניחוש ולא הסרטון. מחובר ⇐ לחשבון (נספר גם בקבוצות);
 * לא מחובר ⇐ גיבוב מזהה הדפדפן, לסך האתר בלבד. דפדפן הבעלים אינו נספר. כישלון אינו מפריע ליצירה.
 */
export function reportVideo(flags: { mine: boolean; named: boolean }, token: string | null | undefined) {
  if (isOwnerBrowser()) return;
  if (token) { void call("/video/made", { method: "POST", body: flags, token }).catch(() => {}); return; }
  const v = visitorId();
  if (!FEEDBACK_URL || !v) return;
  fetch(`${FEEDBACK_URL}/video`, { method: "POST", body: JSON.stringify({ ...flags, v }), keepalive: true }).catch(() => {});
}
