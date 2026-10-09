import { Link } from "react-router-dom";

/** מסך הבית (הכרעת בעלים 9.10.2026): פאנל "הכנסת שלי" בלבד. בלי כפתורי הפניה לשאר המסכים — אליהם מגיעים מהניווט העליון (מחשב) ומהסרגל התחתון, כולל "עוד" (טלפון). */
export default function Home() {
  return (
    <>
      {/* הכותרת הגלויה היא הסרגל העליון ("בחירות 26" והתאריך) — כאן רק לקורא מסך */}
      <h1 className="sr-only">בחירות 26</h1>
      <Link
        to="/guess"
        className="flex items-center justify-between gap-4 flex-wrap bg-frame text-frame-ink border-2 border-frame rounded-theme p-4 md:p-5 no-underline hover:text-frame-ink"
      >
        <span>
          <span className="font-display text-4xl md:text-5xl leading-none block">כמה תקבל כל רשימה? תנחשו.</span>
          <span className="text-sm text-frame-soft block mt-1">מחלקים 120 מושבים, ומשווים למה שמנחשים כל השאר. השערות גולשים, אינן סקר.</span>
        </span>
        <span className="shrink-0 min-h-[48px] px-5 rounded-full bg-signal text-signal-ink font-extrabold inline-flex items-center">לבנות את הכנסת שלי</span>
      </Link>
    </>
  );
}
