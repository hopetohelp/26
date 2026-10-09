import { Link } from "react-router-dom";
import InstallApp from "../components/InstallApp";
import { GovTrend, Hemicycle, MAJORITY, Ranking } from "../components/homeCharts";
import { date, num } from "../lib/format";
import { dayMonth } from "../lib/home";
import { HOME } from "../lib/homeData";

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
          <Hemicycle gov={gov} other={other} />
        </div>
        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <p className="flex flex-wrap items-center gap-x-5 gap-y-1 font-semibold">
            <span className="inline-flex items-center gap-2"><i className="size-[.9rem] rounded-full sw-a" />הממשלה היוצאת <b className="font-num text-xl font-extrabold tabular">{gov}</b></span>
            <span className="inline-flex items-center gap-2"><i className="size-[.9rem] rounded-full sw-b" />כל השאר <b className="font-num text-xl font-extrabold tabular">{other}</b></span>
          </p>
          <p className="mt-2.5 text-sm text-ink-soft">
            נכון ל-{date(home.asOf)} · {num(home.polls)} סקרים · <Link to="/method#model" className="font-semibold">איך זה חושב?</Link>
          </p>
        </div>
      </section>

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-x-12 lg:items-start">
        <section aria-labelledby="home-rank" className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <h2 id="home-rank" className="text-xl font-display leading-tight mb-1">כל הרשימות</h2>
          <Ranking home={home} />
        </section>

        <section aria-labelledby="home-trend" className="mt-10 lg:mt-0 lg:col-start-1 lg:row-start-1">
          <h2 id="home-trend" className="text-xl font-display leading-tight">
            {lo === hi ? `הממשלה היוצאת: ${gov} מנדטים מאז ${dayMonth(home.start)}` : `הממשלה היוצאת: ${lo} עד ${hi} מנדטים מאז ${dayMonth(home.start)}`}
          </h2>
          <GovTrend home={home} />
        </section>

        <aside aria-labelledby="home-cta" className="mt-10 lg:col-start-1 lg:row-start-2 lg:self-start rounded-theme bg-band text-band-ink p-5">
          <h2 id="home-cta" className="text-2xl font-display leading-tight">כמה תקבל כל רשימה? תנחשו.</h2>
          <p className="mt-2 text-sm text-band-soft">השערות גולשים, אינן סקר.</p>
          <Link
            to="/guess"
            className="mt-4 inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-signal text-signal-ink font-extrabold no-underline hover:text-signal-ink"
          >
            לבנות את הכנסת שלי
          </Link>
        </aside>
      </div>
      <InstallApp />
    </>
  );
}
