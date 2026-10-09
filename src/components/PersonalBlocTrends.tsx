import { useMemo } from "react";
import { Link } from "react-router-dom";
import { usePersonalBlocs } from "./PersonalBlocs";
import { DEFAULT_BLOCS, nameOf } from "../pages/guess/model";
import { toTime, usablePolls, type Poll } from "../lib/data";
import { BLOC_ESTIMATE_POLICY, rollingBlocMean } from "../lib/blocEstimates";
import { TrendChart, type Series } from "./charts";
import { Card, ChartWithTable } from "./ui";
import Explained from "./Explained";
import { date, seatsFmt } from "../lib/format";

export default function PersonalBlocTrends({ source, from, to, days, minN }: { source: Poll[]; from: string; to: string; days: number; minN: number }) {
  const unit = usePersonalBlocs();
  const blocs = unit.draft?.mode === "custom" ? unit.draft.blocs : DEFAULT_BLOCS.blocs;
  const data = useMemo(()=>rollingBlocMean(blocs,source,usablePolls,from,to,days,minN),[blocs,source,from,to,days,minN]);
  if (!blocs.some(b=>b.lists.length)) return null;
  const series: Series[] = data.filter(s=>s.points.length).map(s=>({id:`personal-${s.id}`,name:s.name,points:s.points,endLabel:`${s.name} ${s.points[s.points.length-1].estimated ? "כ-" : ""}${seatsFmt(s.points[s.points.length-1].v)}`}));
  return <Card title="הגושים שלי לאורך זמן: ממוצע הסקרים">
    <Link className="inline-flex min-h-[44px] items-center font-bold" to={`/guess?section=blocs&return=${encodeURIComponent('/polls?tab=trends')}`}>עריכת הרכב הגושים</Link>
    <Explained kind="סיכום סקרים" source="הסקרים המסוננים; השלמה מסקרים קודמים של אותה מפלגה" asOf={date(to)} assumption={`סוכמים בתוך כל סקר ורק אז מחשבים ממוצע בחלון ${days} ימים, לפחות ${minN} סקרים לנקודה. אומדן מסומן כשהחלון כולל השלמה; גיל מקור עד ${BLOC_ESTIMATE_POLICY.maxAgeDays} ימים, לפחות חצי הרכב ידוע ולא יותר משליש המנדטים בהשלמה. אין חיבור ממוצעים בין סקרים שונים או מיפוי אוטומטי של איחודים היסטוריים.`} methodAnchor="personal-blocs">
      {series.length ? <ChartWithTable summary="קו מלא: סקרים מלאים בלבד. קו מקווקו: החלון כולל אומדן. כל גוש הוא תרחיש עצמאי והסכומים אינם מתחברים ל־120." chart={<TrendChart series={series} from={toTime(from)} to={toTime(to)} yMax={120} title="ממוצע מנדטים לכל גוש אישי, עם סימון חלונות שהושלמו" />} table={<table className="w-full text-sm"><caption className="sr-only">ממוצע הגושים בכל חלון, כיסוי ומקורות ההשלמה</caption><thead><tr><th className="text-start">גוש · תאריך</th><th>ממוצע</th><th>סקרים</th><th>השלמה</th></tr></thead><tbody>{data.flatMap(s=>s.points.map(p=><tr key={`${s.id}-${p.t}`} className="border-t border-paper-line"><th className="text-start py-2">{s.name}<span className="block font-normal">{date(new Date(p.t).toISOString())}</span></th><td className="text-center tabular">{p.estimated ? "כ-" : ""}{seatsFmt(p.v)}</td><td className="text-center">{p.fullN} מלאים · {p.estimatedN} הושלמו{p.missingN>0 && <span className="block text-ink-soft">{p.missingN} חלקיים לא נכללו</span>}</td><td>{p.estimated ? <details><summary className="min-h-[44px] cursor-pointer">{p.missing.map(nameOf).join(" · ")}</summary>{[...new Map(p.imputed.flatMap(c=>c.sources.map(src=>[`${c.id}-${src.id}`,{...src,party:c.id}] as const))).values()].map(src=><span key={`${src.party}-${src.id}`} className="block text-xs">{nameOf(src.party)} · {src.label} · {date(src.date)}</span>)}</details> : "ללא השלמה"}</td></tr>))}</tbody></table>} /> : <p>אין מספיק סקרים עם נתון מלא או השלמה אמינה בחלון שנבחר. סכומים חלקיים זמינים בארכיון הסקרים.</p>}
    </Explained>
    {blocs.filter(b => b.lists.length && !series.some(s => s.id === `personal-${b.id}`)).map(b => <p key={b.id} className="text-sm text-ink-soft">{b.name}: אין מספיק סקרים תואמים בחלון שנבחר.</p>)}
  </Card>;
}
