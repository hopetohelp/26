import { ClaimForm, VerifyEmail } from "../pages/guess/Account";
import GoogleButton from "../pages/guess/GoogleButton";
import { useSession } from "../pages/guess/useCrowd";

/**
 * כרטיס חובה בכל האתר (הכרעת בעלים 10.10.2026): חשבון ישן — נכנס בקישור אישי או בשם משתתף וסיסמה, או אורח — שעוד לא אומת
 * נדרש מיד לאמת מייל או לחבר Google (בלי "אחר כך"). אחרי האימות הקישור ושם המשתתף נמחקים, והשם נשמר כשם תצוגה.
 * עד אז ההשערה נשמרת ונספרת כרגיל. חשבון חדש אינו ישן, ולכן אינו רואה את הכרטיס.
 */
export default function AccessCard() {
  const session = useSession();
  const me = session.me;
  if (!session.token || !me?.legacy || me.verified) return null;
  return (
    // צף בפינה (לא דוחף את העמוד — גלילה אחת בלבד); בטלפון מעל סרגל הלשוניות
    <section className="fixed z-40 bottom-20 inset-x-3 md:bottom-6 md:inset-x-auto md:start-6 md:w-[30rem] max-h-[75dvh] overflow-y-auto shadow-2xl rounded-theme" aria-labelledby="access-title">
      <div className="border-2 border-ink rounded-theme p-4 bg-paper-card space-y-3">
        <h2 id="access-title" className="text-2xl font-display leading-tight">{me.needsEmail ? "חברו Google או הוסיפו מייל" : "אמתו את המייל או חברו Google"}</h2>
        <p className="text-sm">
          מעכשיו נכנסים לאתר רק במייל וסיסמה או עם Google. אחרי האימות הקישור האישי ושם המשתתף הישנים יימחקו, והשם יישמר כשם שלכם בחשבון.
          ההשערה שלכם נשמרת ונספרת גם בינתיים.
        </p>
        <GoogleButton session={session} onDone={() => void session.refresh()} />
        {me.needsEmail ? <ClaimForm session={session} /> : (
          <div className="space-y-2 border-t border-paper-line pt-3">
            <p className="text-sm">או: אמתו את המייל שבחשבון ({me.emails?.find((e) => !e.verified)?.email ?? "המייל שלכם"}).</p>
            <VerifyEmail session={session} />
          </div>
        )}
      </div>
    </section>
  );
}
