import { lazy, Suspense, useState } from "react";
import { Segmented } from "../components/Choice";
import { BLOC_GRAPH } from "../lib/voterFlow";
import OverviewCards from "../components/OverviewCards";

const FlowSankey = lazy(() => import("../components/FlowSankey"));

type Which = "party" | "bloc";
const graph = (w: Which) => <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><FlowSankey {...(w === "bloc" ? BLOC_GRAPH : {})} /></Suspense>;

/**
 * גרפי המעבר בלבד, להטמעה (הכרעת בעלים 30.10.2026): "מעבר בין מפלגות" ו"מעבר בין גושים" עם השורה המפרטת מתחת לכל גרף.
 * מתג שמחליף ביניהם בלי לצאת מההטמעה (אפשרות "ברצף" בוטלה, הכרעת בעלים 30.10.2026).
 */
export default function FlowGraphs() {
  const [which, setWhich] = useState<Which>("party");
  return (
    <div>
      <h1 className="text-xl md:text-2xl font-display leading-tight">מה השתנה: 2022 מול 2026</h1>
      <OverviewCards keys={["voted", "inKnesset"]} small />
      <Segmented<Which> value={which} onChange={setWhich} label="סוג המעבר" size="sm" tight className="mt-3 w-fit" options={[{ id: "party", label: "מפלגות" }, { id: "bloc", label: "גושים" }]} />
      {graph(which)}
    </div>
  );
}
