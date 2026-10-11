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
      {/* לוח המושבים הוא הכותרת (הכרעת בעלים 11.10.2026): בלי משפט כותרת מעליו. "הממשלה היוצאת" בשתי שורות בגופן הכותרת בפינה הימנית,
          "איך זה חושב?" ומתחתיו מספר הסקרים בשמאלית; הקו העליון של שני הטקסטים הוא הקו העליון של הלוח. */}
      <section aria-labelledby="home-h1" className="w-full max-w-[40rem] mx-auto">
        <h1 id="home-h1" className="sr-only">מפלגות הממשלה היוצאת: {gov} מנדטים. לרוב דרושים {MAJORITY}.</h1>
        <div className="relative">
          <span aria-hidden="true" className="absolute top-0 right-0 font-display text-xl md:text-2xl leading-[1.05]">הממשלה<br />היוצאת</span>
          <span className="absolute top-0 left-0 text-sm text-ink-soft leading-tight text-left">
            <Link to="/method#model" className="font-semibold">איך זה חושב?</Link>
            <br />
            {num(POLL_AVERAGE.polls)} סקרים
          </span>
          <Hemicycle gov={gov} other={other} center={`${gov}/120`} />
        </div>
      </section>

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-x-12 lg:items-start">
        <ScreenLegend><section aria-labelledby="home-rank" className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <h2 id="home-rank" className="sr-only">כל הרשימות</h2>
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
