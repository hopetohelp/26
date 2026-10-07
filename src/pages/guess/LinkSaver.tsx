import { useState } from "react";
import { FEEDBACK_URL, linkWithFeedback, primaryThread } from "../../lib/feedback";
import { Btn, inputCls } from "./ui";

/** הקישור האישי להשערות; אם יש שיחת הערות בדפדפן — היא נוספת אליו (&f=), וכניסה בקישור מחזירה גם אותה */
export const personalLink = (token: string) =>
  linkWithFeedback(`${location.origin}${location.pathname}#/guess?t=${encodeURIComponent(token)}`, FEEDBACK_URL ? primaryThread()?.token : null);

/** שורת ההסבר על השחזור — אותו ניסוח בכל מקום (אין מייל; הכרעת בעלים 6.10.2026) */
export const FORGOT_LINE = "שכחתם סיסמה? פתחו את הקישור האישי שקיבלתם בהרשמה — הוא מכניס אתכם ישר להשערות שלכם, מכל מכשיר, וגם מאפשר לקבוע סיסמה חדשה. אין שחזור במייל.";

const FILE_LINE = "זה הקישור האישי שלכם לאתר ניתוח הבחירות לכנסת ה-26: הוא מכניס אתכם ישר להשערות שלכם, מכל מכשיר, וגם מאפשר לקבוע סיסמה חדשה. אל תשתפו אותו.";

/** שמירת הקישור האישי: העתקה, שליחה לעצמי (שיתוף המכשיר), הורדה כקובץ */
export default function LinkSaver({ token }: { token: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const link = personalLink(token);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMsg("הקישור הועתק. הדביקו אותו במקום בטוח — למשל בהודעה לעצמכם.");
    } catch {
      setMsg("ההעתקה לא הצליחה. סמנו את הקישור בתיבה והעתיקו ביד.");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "הקישור האישי שלי — ההשערה שלי", text: FILE_LINE, url: link });
      setMsg("נשלח. ודאו שההודעה הגיעה רק אליכם.");
    } catch {
      /* המשתמש ביטל */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${FILE_LINE}\n\n${link}\n`], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "הקישור-האישי-שלי.txt" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg("הקובץ ירד. שמרו אותו במקום שתמצאו.");
  };
  return (
    <div className="space-y-2">
      <input readOnly aria-label="הקישור האישי" value={link} dir="ltr" className={`${inputCls} text-xs`} onFocus={(e) => e.target.select()} />
      <div className="flex justify-center gap-3 flex-wrap [&>button]:flex-1 [&>button]:min-w-[8rem]">
        <Btn kind="primary" onClick={copy}>
          העתקה
        </Btn>
        {canShare && <Btn onClick={share}>שליחה לעצמי</Btn>}
        <Btn onClick={download}>הורדה כקובץ</Btn>
      </div>
      {link.includes("&f=") && <p className="text-xs text-ink">הקישור כולל גם את שיחת ההערות שלכם — אותה כניסה להשערות ולהערות.</p>}
      <p className="text-xs text-ink-soft">{canShare ? "\"שליחה לעצמי\" — למשל בוואטסאפ לעצמכם. " : ""}אל תשתפו אותו עם אחרים: מי שמחזיק בו נכנס לחשבון ויכול לשנות ולמחוק.</p>
      {msg && (
        <p role="status" className="text-sm font-bold">
          {msg}
        </p>
      )}
    </div>
  );
}
