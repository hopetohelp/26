import { useEffect, useState } from "react";
import { LOCK_AT } from "../pages/guess/model";

/** הזמן שנשאר, מפורק לימים, שעות, דקות ושניות (מעוגל כלפי מטה לשנייה). null כשהזמן עבר. */
export function clockParts(ms: number): { days: number; hours: number; minutes: number; seconds: number } | null {
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return { days: Math.floor(total / 86_400), hours: Math.floor((total % 86_400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

const two = (n: number) => String(n).padStart(2, "0");

/**
 * שעון עצר למדגמי הבחירות (הכרעת בעלים 11.10.2026, מחליף את הכותרת "תמונת מצב 16 ימים ו-8 שעות למדגמים"):
 * ימים · שעות · דקות · שניות עד 27.10, 22:00, משמאל לימין (הכרעת בעלים 11.10.2026): ימים בשמאל, ושניות בימין. מתעדכן בכל שנייה, כך שהדקות מתחלפות בדיוק. הכותרת של המסך נשארת לקורא מסך בלבד.
 * מתחת ללוח המושבים, בלי כיתוב גלוי "עד המדגמים" (הכרעת בעלים 11.10.2026); ההסבר נשאר בתווית לקורא מסך.
 * מהטוקנים בלבד, ממורכז, שורה אחת בכל רוחב.
 */
export default function ExitPollClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const p = clockParts(LOCK_AT - now);
  if (!p) return <p className="text-center font-display text-2xl">מדגמי הבחירות פורסמו</p>;
  const cells: [string, string][] = [[String(p.days), "ימים"], [two(p.hours), "שעות"], [two(p.minutes), "דקות"], [two(p.seconds), "שניות"]];
  return (
    <div role="timer" aria-label={`עד המדגמים: ${p.days} ימים, ${p.hours} שעות, ${p.minutes} דקות ו-${p.seconds} שניות`} className="text-center">
      <div aria-hidden="true" dir="ltr" className="flex items-start justify-center gap-1.5 md:gap-4">
        {cells.map(([value, unit], i) => (
          <div key={unit} className="flex items-start gap-1.5 md:gap-4">
            {i > 0 && <span className="font-num font-extrabold text-3xl sm:text-4xl md:text-6xl leading-none text-ink-faint">:</span>}
            <div className="flex flex-col items-center min-w-[2.9rem] sm:min-w-[3.6rem] md:min-w-[6rem]">
              <span className="font-num font-extrabold tabular leading-none text-3xl sm:text-4xl md:text-6xl" dir="ltr">{value}</span>
              <span className="mt-1 text-xs md:text-base text-ink-soft">{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
