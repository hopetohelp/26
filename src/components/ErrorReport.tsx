import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FeedbackSheet } from "./Feedback";
import { checkConnection, reportDiag, type ConnectionCheck, type ConnectionKind } from "../lib/crowdApi";
import { FEEDBACK_URL } from "../lib/feedback";
import LocalBackup from "../pages/guess/LocalBackup";

/** כשל ברשת (ולא תשובת שרת): הלוג נושא code=network */
export const isNetworkLog = (log?: string | null) => !!log && /"code":\s*"network"/.test(log);

/** מה אומרת בדיקת החיבור, במילים פשוטות */
export function connectionAdvice(kind: ConnectionKind): string {
  switch (kind) {
    case "all-ok":
      return "בדיקת החיבור עברה עכשיו, כנראה הייתה הפרעה רגעית. נסו שוב.";
    case "all-blocked":
      return "אין חיבור לאינטרנט, או שהחיבור לאתר חסום לגמרי. בדקו את הרשת ונסו שוב.";
    default:
      return "החיבור לשרת השמירה חסום אצלכם, כנראה בסינון אינטרנט, בתוכנת הגנה או בחסם פרסומות. אפשר לנסות רשת אחרת (למשל נתונים סלולריים), דפדפן אחר, או לבקש מספק הסינון להתיר את האתר. ההשערה נשארת אצלכם כטיוטה, ואפשר לשתף אותה גם בלי שמירה.";
  }
}

/** דיווח יזום של הגולש מתוך התקלה; הלוג מוצג לפני השליחה. בכשל רשת — בדיקת חיבור אוטומטית שמצורפת ללוג ומדווחת כמונה אנונימי. */
export default function ErrorReport({ error, errorLog }: { error: string | null; errorLog?: string | null }) {
  const [report, setReport] = useState(false);
  const [check, setCheck] = useState<ConnectionCheck | "running" | null>(null);
  const net = isNetworkLog(errorLog);
  useEffect(() => {
    if (!error || !net) {
      setCheck(null);
      return;
    }
    let live = true;
    setCheck("running");
    checkConnection().then((c) => {
      if (!live) return;
      setCheck(c);
      reportDiag(c.kind);
    });
    return () => {
      live = false;
    };
  }, [error, net, errorLog]);
  if (!error) return null;
  const log = errorLog && check && check !== "running" ? `${errorLog}\n\nבדיקת חיבור: ${JSON.stringify(check)}` : errorLog;
  return (
    <div className="bg-paper-card rounded-theme px-3 py-2 mt-1 space-y-1">
      <p role="alert" className="text-sm text-warn">{error}</p>
      {net && FEEDBACK_URL && <p className="text-xs text-ink">התקלה דווחה אוטומטית לתמיכה, עם פרטים טכניים בלבד.</p>}
      {check === "running" && <p className="text-sm text-ink">בודקים את החיבור…</p>}
      {check && check !== "running" && <p role="status" className="text-sm text-ink">{connectionAdvice(check.kind)}</p>}
      {check && check !== "running" && check.kind !== "all-ok" && <LocalBackup compact />}
      {FEEDBACK_URL && log && (
        <button type="button" aria-haspopup="dialog" onClick={() => setReport(true)} className="min-h-[44px] px-3 rounded-full border border-ink-faint text-ink text-sm font-bold">
          שליחת הערה עם לוג התקלה
        </button>
      )}
      {report && log && createPortal(<FeedbackSheet diagnostic={log} onClose={() => setReport(false)} />, document.body)}
    </div>
  );
}
