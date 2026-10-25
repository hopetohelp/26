import { Link } from "react-router-dom";
import { ScreenLegend } from "../../components/ChartLegend";
import { Duel, ThresholdLine } from "../../components/Duel";
import { GovTrend } from "../../components/homeCharts";
import { DATA_PRODUCTS } from "../../lib/dataCatalog";
import type { Selection } from "../../lib/dataResolver";
import { date } from "../../lib/format";
import { GOV_POINTS, HOME, LATEST_POLLS } from "../../lib/homeData";
import { MODEL_AVERAGE } from "../../lib/sources";

/**
 * תמונת מצב — הפירוט של המתקדם (תוכנית מאוחדת, פרק ב): מתחת לגרף המפלגות ולעוגה, באותו מקור.
 * הדו־קרב, קו החסימה ומגמת הממשלה היוצאת עברו לכאן מהבית הישן; נטען רק במתקדם.
 */
export default function SnapshotDetails({ selection, values }: { selection: Selection; values: Record<string, number | null | undefined> }) {
  const def = DATA_PRODUCTS[selection.product];
  const asOf = date(MODEL_AVERAGE.asOf);
  const [a, b] = [...HOME.safe, ...HOME.edge].filter(r => values[r.id] != null).map(r => ({ ...r, central: values[r.id]! })).sort((x, y) => y.central - x.central);
  return <section aria-label="פירוט מתקדם" className="f-details">
    <div className="f-card">{a && b && <Duel a={a} b={b} polls={LATEST_POLLS} asOf={asOf} label={def.name} method={def.method} />}<div className="c-chart-footer"><Link className="c-chart-link" to="/polls">להשוואת הרשימות ←</Link></div></div>
    <div className="f-card"><ThresholdLine rows={HOME.edge} polls={LATEST_POLLS} asOf={asOf} observedOnly /><div className="c-chart-footer"><Link className="c-chart-link" to="/polls">לנתוני אחוז החסימה ←</Link></div></div>
    <div className="f-card"><ScreenLegend><section aria-labelledby="snap-trend">
      <GovTrend home={HOME} points={GOV_POINTS.map(({ t, values }) => ({ t, values }))} observedOnly heading={<h2 id="snap-trend" className="text-xl font-display leading-tight">מגמת הממשלה היוצאת — ממוצע סקרים</h2>} />
    </section></ScreenLegend><div className="c-chart-footer"><Link className="c-chart-link" to="/polls?tab=trends">למגמות ←</Link></div></div>
  </section>;
}
