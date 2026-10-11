import { Link } from "react-router-dom";
import { ScreenLegend } from "../components/ChartLegend";
import { Duel, ThresholdLine } from "../components/Duel";
import InstallApp from "../components/InstallApp";
import { GovTrend, Hemicycle, MAJORITY } from "../components/homeCharts";
import { date, num } from "../lib/format";
import { dayMonth } from "../lib/home";
import { GOV_POINTS, HOME, LATEST_POLLS } from "../lib/homeData";
import { POLL_AVERAGE } from "../lib/sources";

/**
 * מסך הבית (הכרעת בעלים 11.10.2026): "דו-קרב" בין שתי הרשימות הגדולות, ומתחתיו הרשימות שעל קו החסימה.
 * אחריהם לוח המושבים ומגמת הממשלה היוצאת, ופעולה אחת "הכנסת שלי". הדירוג המלא — בלשונית "תרחישים" (מספר אחד לכל עובדה).
 * מנדטי הממשלה היוצאת: סכום הממוצעים של הרשימות, אותו מספר בלוח, במגמה ובתרחישים (החלטה 14).
 */
const home = HOME;

export default function Home() {
  const { gov, other, series } = home;
  const lo = Math.min(...series.map((s) => s.v));
  const hi = Math.max(...series.map((s) => s.v));
  const [a, b] = [...home.safe, ...home.edge].sort((x, y) => y.central - x.central);
  const asOf = date(POLL_AVERAGE.asOf);
  return (
    <>
      {a && b && <Duel a={a} b={b} polls={LATEST_POLLS} asOf={asOf} />}
      <ThresholdLine rows={home.edge} polls={LATEST_POLLS} asOf={asOf} />

      <div className="mt-14 lg:grid lg:grid-cols-2 lg:gap-x-12 lg:items-start">
        <section aria-labelledby="home-gov" className="w-full max-w-[34rem]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="home-gov" className="text-xl font-display leading-tight">120 המושבים</h2>
            <span className="text-sm text-ink-soft text-left shrink-0">
              <Link to="/method#model" className="font-semibold">איך זה חושב?</Link> · {num(POLL_AVERAGE.polls)} סקרים
            </span>
          </div>
          <p className="sr-only">לרוב דרושים {MAJORITY}.</p>
          <div className="mt-3"><Hemicycle gov={gov} other={other} center={`${gov}/120`} /></div>
        </section>

        <div className="mt-10 lg:mt-0">
          <ScreenLegend><section aria-labelledby="home-trend">
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
        </div>
      </div>
      <InstallApp />
    </>
  );
}
