import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenLegend } from "../components/ChartLegend";
import { Duel, ThresholdLine } from "../components/Duel";
import InstallApp from "../components/InstallApp";
import { GovTrend, Hemicycle, MAJORITY } from "../components/homeCharts";
import { timeLeftText } from "../lib/countdown";
import { date } from "../lib/format";
import { dayMonth } from "../lib/home";
import { GOV_POINTS, HOME, LATEST_POLLS } from "../lib/homeData";
import { POLL_AVERAGE } from "../lib/sources";
import { LOCK_AT } from "./guess/model";

/**
 * מסך הבית (הכרעת בעלים 11.10.2026), לפי הסדר: כותרת "תמונת מצב" עם התאריך של היום; לוח 120 המושבים עם "הממשלה היוצאת" בצד;
 * דו-קרב שתי הרשימות הגדולות; על קו החסימה (זו לצד זו); פעולה אחת "הכנסת שלי"; ובתחתית מגמת הממשלה היוצאת והכפתור "הכנסת שלי".
 * בכל המסך אין שורת סוג/תאריך/"איך זה חושב?" (`Explained bare`). הדירוג המלא — בלשונית "תרחישים".
 * מנדטי הממשלה היוצאת: סכום הממוצעים של הרשימות, אותו מספר בלוח, במגמה ובתרחישים (החלטה 14).
 */
const home = HOME;

export default function Home() {
  const { gov, other, series } = home;
  const lo = Math.min(...series.map((s) => s.v));
  const hi = Math.max(...series.map((s) => s.v));
  const [a, b] = [...home.safe, ...home.edge].sort((x, y) => y.central - x.central);
  const asOf = date(POLL_AVERAGE.asOf);
  // הזמן שנשאר למדגמי הבחירות (27.10, 22:00), מתעדכן בכל דקה
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const left = timeLeftText(LOCK_AT - now);
  return (
    <>
      <header className="text-center">
        <h1 className="font-display text-3xl md:text-4xl leading-tight">תמונת מצב</h1>
        {left && <p className="mt-1 font-display text-xl md:text-2xl leading-tight text-ink-soft"><span className="font-num tabular">{left}</span> למדגמים</p>}
      </header>
      <p className="sr-only">מפלגות הממשלה היוצאת: {gov} מנדטים. לרוב דרושים {MAJORITY}.</p>

      <section aria-label="הממשלה היוצאת בכנסת" className="mt-6 w-full max-w-[40rem] mx-auto">
        <Hemicycle gov={gov} other={other} center={`${gov}/120`} label="הממשלה היוצאת" />
      </section>

      <div className="mt-8">{a && b && <Duel a={a} b={b} polls={LATEST_POLLS} asOf={asOf} />}</div>
      <ThresholdLine rows={home.edge} polls={LATEST_POLLS} asOf={asOf} />


      <ScreenLegend><section aria-labelledby="home-trend" className="mt-10">
        <h2 id="home-trend" className="text-xl font-display leading-tight">
          {lo === hi ? `הממשלה היוצאת: ${gov} מנדטים מאז ${dayMonth(home.start)}` : `הממשלה היוצאת: ${lo} עד ${hi} מנדטים מאז ${dayMonth(home.start)}`}
        </h2>
        <GovTrend home={home} points={GOV_POINTS} />
      </section></ScreenLegend>
      <aside aria-labelledby="home-cta" className="mt-10 rounded-theme bg-band text-band-ink p-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h2 id="home-cta" className="text-2xl font-display leading-tight">כמה תקבל כל רשימה? תנחשו.</h2>
          <p className="mt-2 text-sm text-band-soft">השערות משתתפים, אינן סקר.</p>
        </div>
        <Link
          to="/guess"
          className="ms-auto inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-signal text-signal-ink font-extrabold no-underline hover:text-signal-ink"
        >
          לבנות את הכנסת שלי
        </Link>
      </aside>
      <InstallApp />
    </>
  );
}
