import SiteUsage from "../components/SiteUsage";
import HomeAssistant from "../components/HomeAssistant";
import { useState } from "react";
import SourcePicker from "../components/SourcePicker";
import { useSourcePreference } from "../lib/sourcePreference";
import { resolveDataset, type Selection } from "../lib/dataResolver";
import { DATA_PRODUCTS } from "../lib/dataCatalog";
import { Link } from "react-router-dom";
import { ScreenLegend } from "../components/ChartLegend";
import { Duel, ThresholdLine } from "../components/Duel";
import InstallApp from "../components/InstallApp";
import { GovTrend } from "../components/homeCharts";
import { DoublePie } from "./simple/shared";
import { date } from "../lib/format";
import { GOV_POINTS, HOME, LATEST_POLLS } from "../lib/homeData";
import { MODEL_AVERAGE } from "../lib/sources";

/** בית ציבורי המבוסס על סקרים: פרסה יחסית, דו־קרב, ספירת מכונים ומגמת סקרים. */
const home = HOME;

export default function Home() {
  const preference = useSourcePreference("home");
  const [temporary, setTemporary] = useState<Selection | null>(null);
  const selection = temporary ?? preference.selection;
  const def = DATA_PRODUCTS[selection.product];
  const dataset = resolveDataset(selection, "home");
  const available = dataset.rows.some(r => r.status === "available");
  const [a, b] = [...home.safe, ...home.edge].filter(r => dataset.seats[r.id] !== undefined).map(r => ({ ...r, central: dataset.seats[r.id] })).sort((x, y) => y.central - x.central);
  const asOf = date(MODEL_AVERAGE.asOf);
  return (
    <div className="c-home">
      <div className="c-home-heading"><h1 className="font-display text-2xl">תמונת מצב</h1><HomeAssistant /></div><div className="c-home-grid"><div className="c-home-hall">
      <SourcePicker screen="home" selection={selection} onChange={setTemporary} notice={preference.notice} />

      {available ? <section aria-label="תרשים הגושים בכנסת" className="mt-6 w-full max-w-[32rem] mx-auto">
        <DoublePie values={dataset.seats} />
      </section> : <p role="status" className="text-center my-6 text-ink-soft">—</p>}
      <div className="c-chart-footer"><Link className="c-chart-link" to="/polls">לסקרים ←</Link></div>

      <Participation className="c-participation-wide" /></div><div className="c-home-duel">{a && b && <Duel a={a} b={b} polls={LATEST_POLLS} asOf={asOf} label={def.name} method={def.method} />}<div className="c-chart-footer"><Link className="c-chart-link" to="/polls">להשוואת הרשימות ←</Link></div></div>
      <div className="c-home-edge"><ThresholdLine rows={home.edge} polls={LATEST_POLLS} asOf={asOf} observedOnly /><div className="c-chart-footer"><Link className="c-chart-link" to="/polls">לנתוני אחוז החסימה ←</Link></div></div>


      <div className="c-home-trend"><ScreenLegend><section aria-labelledby="home-trend">
        <GovTrend home={home} points={GOV_POINTS.map(({ t, values }) => ({ t, values }))} observedOnly heading={<h2 id="home-trend" className="text-xl font-display leading-tight">מגמת הממשלה היוצאת — ממוצע סקרים</h2>} />
      </section></ScreenLegend><div className="c-chart-footer"><Link className="c-chart-link" to="/polls?tab=trends">למגמות ←</Link></div></div></div>
      <Participation className="c-participation-mobile" />
      <SiteUsage />
      <InstallApp />
    </div>
  );
}

function Participation({ className }: { className: string }) {
  return <aside aria-label="הניחוש שלך" className={`c-participation ${className}`}>
    <div><h2 className="font-display">מה הניחוש שלך?</h2><p>ניחושי משתתפים, אינם סקר.</p></div>
    <Link to="/guess">לבניית הניחוש שלי ←</Link>
  </aside>;
}
