import { Link } from "react-router-dom";
import { usePersonalBlocs } from "./PersonalBlocs";
import { DEFAULT_BLOCS } from "../pages/guess/model";
import { rollingMedian, seatsIn, toTime, type Poll } from "../lib/data";
import { blocValues } from "../lib/personalBlocs";
import { TrendChart, type Series } from "./charts";
import { Card, ChartWithTable } from "./ui";
import Explained from "./Explained";
import { date, seatsFmt } from "../lib/format";

export default function PersonalBlocTrends({ source, from, to, days, minN }: { source: Poll[]; from: string; to: string; days: number; minN: number }) {
  const unit = usePersonalBlocs();
  const blocs = unit.draft?.mode === "custom" ? unit.draft.blocs : DEFAULT_BLOCS.blocs;
  const mapping = Object.fromEntries([...new Set(blocs.flatMap(b => b.lists))].map(id => [id, id]));
  // אין שימוש ב-lineage: איחוד היסטורי אינו התאמה של מפלגה זהה.
  const projected = source.map(p => {
    const values = { ...p.values };
    const seats = Object.fromEntries(Object.keys(mapping).map(id => [id, seatsIn(p, id)]));
    for (const b of blocValues(blocs, seats, mapping)) if (b.total !== null) values[`personal-${b.id}`] = { s: b.total };
    return { ...p, values };
  });
  const series: Series[] = blocs.map(b => ({ id: `personal-${b.id}`, name: b.name, points: rollingMedian(`personal-${b.id}`, from, to, days, 3, projected).filter(p => p.n >= minN) })).filter(s => s.points.length);
  if (!series.length) return null;
  return <Card title="הגושים שלי לאורך זמן: חציון הסקרים">
    <Link className="inline-flex min-h-[44px] items-center font-bold" to={`/guess?section=blocs&return=${encodeURIComponent('/polls?tab=trends')}`}>עריכת הרכב הגושים</Link>
    <Explained kind="סיכום סקרים" source="אותם סקרים מסוננים של גרף המפלגות; רק סקרים עם נתון לכל מפלגות הגוש" asOf={date(to)} assumption={`מסכמים מנדטים בתוך כל סקר ורק אז מחשבים חציון בחלון ${days} ימים. לפחות ${minN} סקרים לנקודה. אין חיבור חציוני מפלגות ואין השלמה היסטורית.`} methodAnchor="personal-blocs">
      {series.length ? <ChartWithTable summary="כל קו הוא תרחיש עצמאי. הסכומים אינם מתחברים ל־120." chart={<TrendChart series={series} from={toTime(from)} to={toTime(to)} yMax={120} title="חציון מנדטים לכל גוש אישי לאורך זמן" />} table={<table className="w-full text-sm"><caption className="sr-only">תחילת וסוף מגמת הגושים</caption><thead><tr><th className="text-start">גוש</th><th>תחילת התקופה הזמינה</th><th>סוף התקופה הזמינה</th></tr></thead><tbody>{series.map(s => <tr key={s.id} className="border-t border-paper-line"><th className="text-start py-2">{s.name}</th><td className="text-center tabular">{seatsFmt(s.points[0].v)} ({date(new Date(s.points[0].t).toISOString())})</td><td className="text-center tabular">{seatsFmt(s.points[s.points.length - 1].v)} ({date(new Date(s.points[s.points.length - 1].t).toISOString())})</td></tr>)}</tbody></table>} /> : <p>אין מספיק סקרים עם הרכב תואם לכל מפלגות הגושים בתקופה שבחרתם.</p>}
    </Explained>
    {blocs.filter(b => !series.some(s => s.id === `personal-${b.id}`)).map(b => <p key={b.id} className="text-sm text-ink-soft">{b.name}: אין מספיק סקרים תואמים בחלון שנבחר.</p>)}
  </Card>;
}
