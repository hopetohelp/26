import { useEffect, useState } from "react";
import { BLOCK_EVENT, SERVER_HOSTS, serverBlocked } from "../lib/crowdApi";

/** true כשתשובות השרת נחסמות בדרך (src/lib/crowdApi.ts, serverBlocked); מתעדכן בכל בקשה */
export function useServerBlocked(): boolean {
  const [on, setOn] = useState(serverBlocked);
  useEffect(() => {
    const update = () => setOn(serverBlocked());
    update();
    window.addEventListener(BLOCK_EVENT, update);
    return () => window.removeEventListener(BLOCK_EVENT, update);
  }, []);
  return on;
}

/** נוסח מוכן לבקשה מספק הסינון: כל הנתיבים, כי לשרת יש כתובות רבות ואישור של כתובת אחת אינו מספיק */
export function filterRequestText(hosts: string[] = SERVER_HOSTS, site = typeof location === "undefined" ? "" : location.origin + location.pathname): string {
  return [
    `שלום, באתר ${site} (ניתוח סקרי הבחירות לכנסת ה-26) האתר עצמו פתוח, אבל השרת שלו חסום אצלי (לא ידוע), ולכן אי אפשר להירשם, להתחבר או לשמור.`,
    "השרת מחזיר נתונים בלבד (JSON), בלי תמונות ובלי תוכן גלישה. יש לו כתובות רבות, ולכן אישור של כתובת בודדת אינו מספיק.",
    "אבקש לפתוח את הדומיינים האלה במלואם — כל הנתיבים, כולל בקשות POST:",
    ...hosts,
    "תודה רבה.",
  ].join("\n");
}

/**
 * הסבר כשמערכת סינון (למשל נטפרי) מעבירה את הבקשות לשרת אבל חוסמת את התשובות (נבדק 11.10.2026):
 * מה קרה, אילו כתובות לבקש לפתוח, ונוסח מוכן להעתקה. בלי אופליין: אין אינטרנט בכלל ⇐ הודעה קצרה אחרת.
 */
export default function FilterBlocked({ signedIn = false, onRetry }: { signedIn?: boolean; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) return <p role="status" className="text-sm text-ink">אין חיבור לאינטרנט. מה שעשיתם נשמר בדפדפן הזה, ונסו שוב כשהחיבור יחזור.</p>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(filterRequestText());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div role="status" className="border-2 border-warn rounded-theme p-3 space-y-2 text-sm">
      <p className="font-bold text-base">נראה שמערכת סינון חוסמת את התשובות מהשרת של האתר</p>
      <p>
        {signedIn ? "ייתכן שהכניסה כבר נקלטה בשרת, " : "הבקשות שלכם יוצאות, "}
        אבל מערכת הסינון (למשל נטפרי) לא מעבירה אליכם את התשובות. לכן במכשיר הזה אי אפשר להשלים כניסה, הרשמה או שמירה, ולהציג את האזור האישי. מה שעשיתם נשמר בדפדפן הזה.
      </p>
      <p className="font-bold">מה עושים: מבקשים מספק הסינון לפתוח את הכתובות האלה במלואן (כל הנתיבים, כולל בקשות POST):</p>
      <ul className="space-y-1">
        {SERVER_HOSTS.map((h) => (
          <li key={h} dir="ltr" className="text-start font-bold break-all">{h}</li>
        ))}
      </ul>
      <p className="text-ink-soft">בינתיים אפשר להיכנס מרשת אחרת, למשל נתונים סלולריים. אחרי הפתיחה, הכניסה תעבוד בלי להירשם מחדש.</p>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={copy} className="min-h-[44px] px-3 rounded-full border border-ink-faint text-ink font-bold">
          {copied ? "הנוסח הועתק" : "העתקת נוסח הבקשה לסינון"}
        </button>
        {onRetry && (
          <button type="button" onClick={onRetry} className="min-h-[44px] px-3 rounded-full border border-paper-line text-ink font-bold">
            לנסות שוב
          </button>
        )}
      </div>
    </div>
  );
}
