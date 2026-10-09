import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { linkAcked, setLinkAck } from "../lib/crowdSession";
import LinkSaver from "../pages/guess/LinkSaver";
import { ClaimForm } from "../pages/guess/Account";
import GoogleButton from "../pages/guess/GoogleButton";
import { Btn } from "../pages/guess/ui";
import { useSession } from "../pages/guess/useCrowd";

/**
 * כרטיס צף בכל האתר (הכרעות בעלים 9.10.2026):
 * 1. חשבון ישן בלי מייל ובלי Google ⇐ נדרש להוסיף (ההשערה נשמרת ונספרת גם בינתיים; "אחר כך" מסתיר עד הביקור הבא).
 * 2. חשבון חדש ⇐ קישור הכניסה האישי שנוצר מיד, עד שמאשרים ששמרו אותו.
 */
export default function AccessCard() {
  const session = useSession();
  const [acked, setAcked] = useState(linkAcked);
  const [later, setLater] = useState(false);
  useEffect(() => setAcked(linkAcked()), [session.link]);
  if (!session.token) return null;
  const needsEmail = !!session.me?.needsEmail && !later;
  if (!needsEmail && (!session.link || acked)) return null;
  const done = () => (setLinkAck(true), setAcked(true));
  return (
    // צף בפינה (לא דוחף את העמוד — גלילה אחת בלבד); בטלפון מעל סרגל הלשוניות
    <section className="fixed z-40 bottom-20 inset-x-3 md:bottom-6 md:inset-x-auto md:start-6 md:w-[30rem] max-h-[75dvh] overflow-y-auto shadow-2xl rounded-theme" aria-labelledby="access-title">
      <div className="border-2 border-ink rounded-theme p-4 bg-paper-card space-y-3">
        {needsEmail ? (
          <>
            <h2 id="access-title" className="text-2xl font-display leading-tight">הוסיפו מייל או Google לחשבון</h2>
            <p className="text-sm">מעכשיו כל חשבון באתר מחובר למייל או ל-Google, וחשבון אחד לכל מייל. ההשערה שלכם נשמרת ונספרת גם בינתיים. המייל נשמר מוצפן ומוצג רק לכם.</p>
            <GoogleButton session={session} onDone={() => void session.refresh()} />
            <ClaimForm session={session} />
            <Btn onClick={() => setLater(true)}>אחר כך</Btn>
          </>
        ) : (
          <>
            <h2 id="access-title" className="text-2xl font-display leading-tight">נוצר לכם קישור כניסה אישי — שמרו אותו</h2>
            <p className="text-sm">הקישור מכניס אתכם ישר לחשבון, מכל מכשיר, וגם מאפשר לקבוע סיסמה חדשה.</p>
            <LinkSaver token={session.link!} />
            <div className="flex flex-wrap gap-2 items-center">
              <Btn onClick={done}>שמרתי את הקישור</Btn>
              <Link to="/support" className="text-sm font-bold min-h-[44px] flex items-center">לאזור האישי</Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
