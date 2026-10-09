import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { linkAcked, setLinkAck } from "../lib/crowdSession";
import LinkSaver from "../pages/guess/LinkSaver";
import { ClaimForm } from "../pages/guess/Account";
import { Btn } from "../pages/guess/ui";
import { useSession } from "../pages/guess/useCrowd";

/**
 * שתי דרכים להיכנס לכל פרטי המשתמש, בכל האתר (הכרעת בעלים 9.10.2026):
 * 1. הקישור האישי — נוצר אוטומטית בשינוי הראשון (או בהרשמה), ומוצג כאן עד שמאשרים ששמרתם.
 * 2. המלצה להירשם עם שם משתמש וסיסמה (לחשבון אורח).
 */
export default function AccessCard() {
  const session = useSession();
  const [acked, setAcked] = useState(linkAcked);
  useEffect(() => setAcked(linkAcked()), [session.link]);
  if (!session.token || !session.link || acked) return null;
  const guest = session.me?.guest !== false;
  const done = () => (setLinkAck(true), setAcked(true));
  return (
    // צף בפינה (לא דוחף את העמוד — גלילה אחת בלבד); בטלפון מעל סרגל הלשוניות
    <section className="fixed z-40 bottom-20 inset-x-3 md:bottom-6 md:inset-x-auto md:start-6 md:w-[30rem] max-h-[75dvh] overflow-y-auto shadow-2xl rounded-theme" aria-labelledby="access-title">
      <div className="border-2 border-ink rounded-theme p-4 bg-paper-card space-y-2">
        <h2 id="access-title" className="text-2xl font-display leading-tight">
          {guest ? "נוצר לכם קישור אישי — שמרו אותו" : "נרשמתם. עכשיו שמרו את הקישור האישי"}
        </h2>
        <p className="text-sm">
          {guest
            ? "השינויים שלכם נשמרים בחשבון שנוצר בשבילכם. הכניסה שמורה רק בדפדפן הזה ובאופן זמני — ממכשיר אחר אפשר לחזור רק עם הקישור הזה."
            : "הקישור מכניס אתכם ישר לכל הנתונים שלכם, מכל מכשיר, וגם מאפשר לקבוע סיסמה חדשה."}
        </p>
        <LinkSaver token={session.link} />
        <div className="flex flex-wrap gap-2 items-center">
          <Btn onClick={done}>שמרתי את הקישור</Btn>
          <Link to="/support" className="text-sm font-bold min-h-[44px] flex items-center">כל הנתונים שלי</Link>
        </div>
        {guest && (
          <details>
            <summary className="cursor-pointer min-h-[44px] flex items-center font-bold">מומלץ: הרשמה עם שם משתמש וסיסמה</summary>
            <p className="text-sm text-ink-soft mb-2">בלי שם אמיתי ובלי מייל. מה ששמרתם נשאר, ואפשר להיכנס מכל מכשיר גם בלי הקישור.</p>
            <ClaimForm session={session} />
          </details>
        )}
      </div>
    </section>
  );
}
