import BlocsDrawer from "./BlocsDrawer";
import { useMemo } from "react";
import { KNESSET_GROUPS } from "../lib/simpleSources";
import { type Poll } from "../lib/data";
import { rollingBlocMean } from "../lib/blocTrend";
import { type Series } from "./charts";
import CandleTrend from "./CandleTrend";
import { electionMarkers } from "../lib/electionMarkers";
import { ChartWithTable } from "./ui";
import Explained from "./Explained";
import { date, seatsFmt } from "../lib/format";

export default function PersonalBlocTrends({ source, from, to, days, minN }: { source: Poll[]; from: string; to: string; days: number; minN: number }) {
  const blocs = KNESSET_GROUPS;
  const data = useMemo(()=>rollingBlocMean(blocs,source,from,to,days,minN),[blocs,source,from,to,days,minN]);
  if (!blocs.some(b=>b.lists.length)) return null;
  const series: Series[] = data.filter(s=>s.points.length).map(s=>({id:`personal-${s.id}`,name:s.name,points:s.points,endLabel:`${s.name} ${seatsFmt(s.points[s.points.length-1].v)}`}));
  return <BlocsDrawer title="חלוקת הכנסת לאורך זמן: ממוצע הסקרים" returnTo="/polls?tab=trends">
    <Explained showMeta={false} kind="סיכום סקרים" source="הסקרים המסוננים" asOf={date(to)} assumption={`סוכמים בתוך כל סקר ורק אז מחשבים ממוצע בחלון ${days} ימים, לפחות ${minN} סקרים לנקודה. סקר שסקר לפחות מפלגה אחת מהגוש נכנס; מפלגה שלא נסקרה נספרת 0. אין חיבור ממוצעים בין סקרים שונים או מיפוי אוטומטי של איחודים היסטוריים.`} methodAnchor="personal-blocs">
      {series.length ? <ChartWithTable summary="האחדות חופפת לנתניהו ולאייזנקוט, ולכן הסכומים אינם מתחברים ל־120." chart={<div className="space-y-5">{series.map((x) => <div key={x.id}><h4 className="font-bold text-sm mb-0.5">{x.name}</h4><CandleTrend title={`ממוצע מנדטים: ${x.name}`} series={[x]} majority={61} windowDays={days} markers={electionMarkers(blocs.find(b => `personal-${b.id}` === x.id)?.lists ?? [])} /></div>)}</div>} table={<table className="w-full text-sm"><caption className="sr-only">ממוצע הגושים בכל חלון</caption><thead><tr><th className="text-start">גוש · תאריך</th><th>ממוצע</th><th>סקרים</th></tr></thead><tbody>{data.flatMap(s=>s.points.map(p=><tr key={`${s.id}-${p.t}`} className="border-t border-paper-line"><th className="text-start py-2">{s.name}<span className="block font-normal">{date(new Date(p.t).toISOString())}</span></th><td className="text-center tabular">{seatsFmt(p.v)}</td><td className="text-center">{p.n}</td></tr>))}</tbody></table>} /> : <p>אין מספיק סקרים תואמים בחלון שנבחר.</p>}
    </Explained>
    {blocs.filter(b => b.lists.length && !series.some(s => s.id === `personal-${b.id}`)).map(b => <p key={b.id} className="text-sm text-ink-soft">{b.name}: אין מספיק סקרים תואמים בחלון שנבחר.</p>)}
  </BlocsDrawer>;
}
