import { Link } from "react-router-dom";
import { ScreenLegend } from "../components/ChartLegend";
import InstallApp from "../components/InstallApp";
import { GovTrend, Hemicycle, MAJORITY, Ranking } from "../components/homeCharts";
import { num } from "../lib/format";
import { dayMonth } from "../lib/home";
import { GOV_POINTS, HOME } from "../lib/homeData";
import { POLL_AVERAGE } from "../lib/sources";

/**
 * מסך הבית (הכרעות בעלים 9.10.2026): התשובה והגרפים קודם, ובלי כפתורי הפניה חוץ מ"הכנסת שלי".
 * שלוש שאלות לפי הסדר: מה המצב (כותרת ולוח 120 המושבים), מי על הסף ומי עולה (כל הרשימות), לאן זה הולך (מגמה). אחריהן פעולה אחת.
 * מנדטי הממשלה היוצאת: סכום הממוצעים של הרשימות, אותו מספר בכותרת, בלוח, בדירוג ובמגמה (החלטה 14).
 */
const home = HOME;

export default function Home() {
  const { gov, other, series } = home;
  const lo = Math.min(...series.map((s) => s.v));
  const hi = Math.max(...series.map((s) => s.v));
  return (
    <>
      <section aria-labelledby="home-h1" className="grid gap-y-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-x-12 lg:items-center">
        <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
          <h1 id="home-h1" className="font-display text-[1.8rem] lg:text-[2.8rem] leading-[1.06] [text-wrap:balance]">
            מפלגות הממשלה היוצאת: {gov} מנדטים. לרוב דרושים {MAJORITY}.
          </h1>
        </div>
        <div className="mt-2 w-full max-w-[34rem] mx-auto lg:mt-0 lg:mx-0 lg:max-w-[46rem] lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center">
          {/* בפינות לוח המושבים (הכרעת בעלים 11.10.2026): "הממשלה היוצאת" מימין למעלה, מעל מושבי הממשלה; מספר הסקרים והקישור משמאל למעלה; במרכז 53/120 */}
          <div className="relative">
            <span className="absolute top-0 right-0 text-sm font-bold">הממשלה היוצאת</span>
            <span className="absolute top-0 left-0 text-sm text-ink-soft leading-snug text-left">
              {num(POLL_AVERAGE.polls)} סקרים
              <br />
              <Link to="/method#model" className="font-semibold">איך זה חושב?</Link>
            </span>
            <Hemicycle gov={gov} other={other} center={`${gov}/120`} />
          </div>
        </div>
      </section>

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-x-12 lg:items-start">
        <ScreenLegend><section aria-labelledby="home-rank" className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <h2 id="home-rank" className="text-xl font-display leading-tight mb-1">כל הרשימות</h2>
          <Ranking home={home} />
        </section></ScreenLegend>

        <ScreenLegend><section aria-labelledby="home-trend" className="mt-10 lg:mt-0 lg:col-start-1 lg:row-start-1">
          <h2 id="home-trend" className="text-xl font-display leading-tight">
            {lo === hi ? `הממשלה היוצאת: ${gov} מנדטים מאז ${dayMonth(home.start)}` : `הממשלה היוצאת: ${lo} עד ${hi} מנדטים מאז ${dayMonth(home.start)}`}
          </h2>
          <GovTrend home={home} points={GOV_POINTS} />
        </section></ScreenLegend>

        <aside aria-labelledby="home-cta" className="mt-10 lg:col-start-1 lg:row-start-2 lg:self-start rounded-theme bg-band text-band-ink p-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
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
      </div>
      <InstallApp />
    </>
  );
}
