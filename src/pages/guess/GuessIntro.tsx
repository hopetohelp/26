import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { timeLeftText, wallClockLeft } from "../../lib/countdown";
import { LOCK_AT } from "./model";

/**
 * כותרת "הכנסת שלי" ושאלה עם ספירה לאחור עד מדגמי הבחירות (27.10, 22:00); בשורת הכותרת, בצד שמאל, כפתור "היסטוריית השערות" (הכרעת בעלים 18.10.2026).
 * המגירות (הושלמה, ההצבעות, איך בונים, הגושים) נמצאות מתחתיה ב-`Mine`.
 */
export function HistoryLink() {
  const [params] = useSearchParams();
  const to = new URLSearchParams(params);
  to.set("section", "history");
  to.set("return", `/guess?${params.toString()}`);
  return <Link className="c-chart-link shrink-0" to={`/guess?${to}`}>היסטוריית השערות</Link>;
}

export default function GuessIntro() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const left = timeLeftText(wallClockLeft(LOCK_AT, now));
  return (
    <section aria-labelledby="guess-intro-title" className="c-guess-intro c-page-title mb-2">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 id="guess-intro-title" className="text-3xl md:text-5xl font-display leading-tight">הכנסת שלי</h1>
        <HistoryLink />
      </div>
      <p className="text-xl font-display leading-tight mb-2">
        {left ? <>מה ההשערה שלכם לתוצאות האמת בעוד <span className="font-num tabular">{left}</span>?</> : "מדגמי הבחירות פורסמו. ההשערות נסגרו."}
      </p>
    </section>
  );
}
