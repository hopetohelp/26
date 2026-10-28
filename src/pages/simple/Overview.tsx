import { Suspense, lazy } from "react";
import { IDS } from "../guess/model";
import { useSession } from "../guess/useCrowd";
import { useHagzara } from "./hagzara";
import { simpleValue } from "../../lib/simpleSources";
import { useCrowdDashboard } from "../../lib/sources";
import { useInterface } from "../../lib/interfaceMode";
import { page } from "../../lib/chunkReload";
import { BlocChart, FocusFoot, LegendCapsule, LegendLine, PartyChart, SourceBar, orderedLists, useSimpleSource } from "./shared";
const SnapshotDetails = lazy(page(() => import("./SnapshotDetails")));
/** תמונת מצב — מסך אחד לשני המצבים: קפסולות הסקרים וממוצע המקור הנבחר, וסיכום הגושים; במתקדם נוסף פירוט מתחת */
export default function Overview() {
  const source = useSimpleSource();
  const { advanced } = useInterface();
  const hagzaraLogo = useHagzara(useSession())?.logoUrl ?? null;
  const crowd = Object.fromEntries((useCrowdDashboard().dashboard?.seats?.full ?? []).map(r => [r.list, r.mean]));
  const values = Object.fromEntries(IDS.map(id => [id, simpleValue(source.selection, [id])]));
  return <div className="max-w-6xl mx-auto"><h1 className="sr-only">הסקרים</h1><SourceBar source={source} />
    <div className="f-grid"><PartyChart selection={source.selection} lists={orderedLists(source.selection, [], crowd)} marks={id => [{ value: values[id], side: "up" }]} legend={<><LegendCapsule /><LegendLine label="ממוצע" /></>} />
      <div className="f-side"><BlocChart values={values} logo={hagzaraLogo} /></div></div>
    {advanced && <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><SnapshotDetails selection={source.selection} values={values} /></Suspense>}
    <FocusFoot /></div>;
}
