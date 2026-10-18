import { useEffect, useState } from "react";
import { HowTo } from "./Seats";
import { timeLeftText, wallClockLeft } from "../../lib/countdown";
import { LOCK_AT } from "./model";

/**
 * כרטיס ההסבר היחיד בראש "הכנסת שלי" (הכרעת בעלים 10.10.2026), וכותרת המסך היא חלק ממנו: שאלה עם ספירה לאחור עד מדגמי הבחירות (27.10, 22:00),
 * הסבר שמירה ושיתוף מותאם לאורח או למשתתף רשום בתוך מגירה; השאלה תמיד גלויה.
 */
export default function GuessIntro({ signedIn }: { signedIn: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const left = timeLeftText(wallClockLeft(LOCK_AT, now));
  return (
    <section aria-labelledby="guess-intro-title" className="c-guess-intro c-page-title mb-5">
      <h1 id="guess-intro-title" className="text-3xl md:text-5xl font-display leading-tight mb-2">הכנסת שלי</h1>
      <p className="text-xl font-display leading-tight mb-2">
        {left ? <>מה ההשערה שלכם לתוצאות האמת בעוד <span className="font-num tabular">{left}</span>?</> : "מדגמי הבחירות פורסמו. ההשערות נסגרו."}
      </p>
      <HowTo signedIn={signedIn} />
    </section>
  );
}
