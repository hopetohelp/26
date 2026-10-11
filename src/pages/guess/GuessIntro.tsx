import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { timeLeftText } from "../../lib/countdown";
import { LOCK_AT } from "./model";

/**
 * כרטיס ההסבר היחיד בראש "הכנסת שלי" (הכרעת בעלים 10.10.2026), וכותרת המסך היא חלק ממנו: שאלה עם ספירה לאחור עד מדגמי הבחירות (27.10, 22:00),
 * ושתי שורות שמותאמות לאורח או למשתתף רשום. אין כאן כפתור "הבנתי" — הכרטיס תמיד מוצג.
 */
export default function GuessIntro({ signedIn }: { signedIn: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const left = timeLeftText(LOCK_AT - now);
  return (
    <section aria-labelledby="guess-intro-title" className="bg-paper-card border-2 border-ink rounded-theme p-4 mb-5">
      <h1 id="guess-intro-title" className="text-3xl font-display leading-tight mb-2">הכנסת שלי</h1>
      <p className="text-xl font-display leading-tight mb-2">
        {left ? <>מה ההשערה שלכם לתוצאות האמת בעוד <span className="font-num tabular">{left}</span>?</> : "מדגמי הבחירות פורסמו. ההשערות נסגרו."}
      </p>
      <ul className="text-sm leading-relaxed list-disc ps-5 space-y-1">
        {signedIn ? (
          <>
            <li>ההשערה נשמרת בחשבון שלכם, ורק האחרונה נספרת בסקר האתר.</li>
            <li>אפשר לשתף אותה, ולראות את ההיסטוריה בלשונית "ההשערות שלי".</li>
          </>
        ) : (
          <>
            <li>אפשר לשמור כאורח, ולשתף אחרים בהשערה שלכם.</li>
            <li>ואפשר להירשם, לשמור את היסטוריית ההשערות שלכם, ולהשפיע על סקר האתר. ההרשמה מוצעת אחרי השמירה, או <Link to="/support">באזור האישי</Link>.</li>
          </>
        )}
      </ul>
    </section>
  );
}
