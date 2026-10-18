import HomeAssistant from "../components/HomeAssistant";
import { useState } from "react";
import SourcePicker from "../components/SourcePicker";
import { useSourcePreference } from "../lib/sourcePreference";
import { resolveData, resolveDataset, type Selection } from "../lib/dataResolver";
import { defaultBlocs } from "./guess/model";
import { DATA_PRODUCTS } from "../lib/dataCatalog";
import { Link } from "react-router-dom";
import { ScreenLegend } from "../components/ChartLegend";
import { Duel, ThresholdLine } from "../components/Duel";
import InstallApp from "../components/InstallApp";
import { GovTrend, Hemicycle, MAJORITY } from "../components/homeCharts";
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
  const definitions = defaultBlocs();
  const coalition = resolveData(selection, definitions.find(b => b.id === "gov")!.lists, "home").value;
  const arab = resolveData(selection, definitions.find(b => b.id === "arab")!.lists, "home").value;
  const opposition = resolveData(selection, definitions.find(b => b.id === "rest")!.lists, "home").value;
  const blocs = { coalition: coalition ?? 0, arab: arab ?? 0, opposition: opposition ?? 0 };
  const [a, b] = [...home.safe, ...home.edge].filter(r => dataset.seats[r.id] !== undefined).map(r => ({ ...r, central: dataset.seats[r.id] })).sort((x, y) => y.central - x.central);
  const asOf = date(MODEL_AVERAGE.asOf);
  return (
    <div className="c-home">
      <div className="c-home-heading"><h1 className="font-display text-2xl">תמונת מצב</h1><HomeAssistant /></div><div className="c-home-grid"><div className="c-home-hall">
      <SourcePicker screen="home" selection={selection} onChange={setTemporary} notice={preference.notice} />
      <p className="sr-only">גוש נתניהו: {blocs.coalition} מנדטים, המפלגות הערביות: {blocs.arab}, גוש אייזנקוט: {blocs.opposition}. לרוב דרושים {MAJORITY}.</p>

      {available ? <section aria-label="תרשים הגושים בכנסת" className="mt-6 w-full max-w-[32rem] mx-auto">
        <Hemicycle coalition={blocs.coalition} arab={blocs.arab} opposition={blocs.opposition} duel={["גוש נתניהו", "גוש אייזנקוט"]} />
        {selection.product === "polls.mean" && <p className="text-xs text-ink-soft text-center">תרשים יחסי של הממוצע; מושב בשני צבעים מסמן שבר. המספרים במרכז אינם מעוגלים למנדטים שלמים.</p>}
      </section> : <p role="status" className="text-center my-6 text-ink-soft">—</p>}
      <div className="c-chart-footer"><Link className="c-chart-link" to="/polls">לסקרים ←</Link></div>

      <Participation className="c-participation-wide" /></div><div className="c-home-duel">{a && b && <Duel a={a} b={b} polls={LATEST_POLLS} asOf={asOf} label={def.name} method={def.method} />}<div className="c-chart-footer"><Link className="c-chart-link" to="/polls">להשוואת הרשימות ←</Link></div></div>
      <div className="c-home-edge"><ThresholdLine rows={home.edge} polls={LATEST_POLLS} asOf={asOf} observedOnly /><div className="c-chart-footer"><Link className="c-chart-link" to="/polls">לנתוני אחוז החסימה ←</Link></div></div>


      <div className="c-home-trend"><ScreenLegend><section aria-labelledby="home-trend">
        <GovTrend home={home} points={GOV_POINTS.map(({ t, values }) => ({ t, values }))} observedOnly heading={<h2 id="home-trend" className="text-xl font-display leading-tight">מגמת הממשלה היוצאת — ממוצע סקרים</h2>} />
      </section></ScreenLegend><div className="c-chart-footer"><Link className="c-chart-link" to="/polls?tab=trends">למגמות ←</Link></div></div></div>
      <Participation className="c-participation-mobile" />
      <InstallApp />
    </div>
  );
}

function Participation({ className }: { className: string }) {
  return <aside aria-label="ההשערה שלך" className={`c-participation ${className}`}>
    <div><h2 className="font-display">מה ההשערה שלך?</h2><p>השערות משתתפים, אינן סקר.</p></div>
    <Link to="/guess">לבניית הכנסת שלי ←</Link>
  </aside>;
}
