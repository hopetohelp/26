import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui";
import { call, type Dashboard as D, type SeatStat, type SeatsPayload } from "../../lib/crowdApi";
import { loadDraft } from "../../lib/crowdSession";
import { seatsFmt } from "../../lib/format";
import { GOV_IDS, nameOf } from "./model";
import { Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

type Subject = "seats" | "blocs";
type View = "table" | "chart";

const range = (s: SeatStat) => s.min === s.max ? "" : `${seatsFmt(s.min)}–${seatsFmt(s.max)}`;

export default function Dashboard({ session }: { session: ReturnType<typeof useSession> }) {
  const [d, setD] = useState<D | null>(null);
  const [subject, setSubject] = useState<Subject>("seats");
  const [view, setView] = useState<View>("table");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void session.refresh(); }, [session.refresh]);
  useEffect(() => {
    if (!session.online) return;
    call<D>("/dashboard").then(setD).catch((e) => setErr(errorText(e)));
  }, [session.online]);

  if (!session.online) return <Notice>הסטטיסטיקות יוצגו כשהחיבור לשרת יהיה פעיל.</Notice>;
  if (err) return <Notice tone="warn">{err}</Notice>;
  if (!d) return <p className="text-ink-soft">טוען…</p>;

  const mine = loadDraft<SeatsPayload>("seats") ?? session.me?.latest.seats?.payload as SeatsPayload | undefined;
  return (
    <div>
      <div className="mb-4"><Notice tone="warn">{d.participants < 30 ? "מעט משתתפים — הנתונים אינם מייצגים את הציבור." : "השערות הגולשים אינן מדגם מייצג."}</Notice></div>
      <p className="text-sm text-ink-soft mb-4">{d.participants} משתתפים. כל ההשערות מוצגות לפי הממוצע.</p>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Toggle value={subject} setValue={setSubject} options={[["seats","מנדטים"],["blocs","גושים"]]} label="סוג נתון" />
        <Toggle value={view} setValue={setView} options={[["table","טבלה"],["chart","גרף"]]} label="צורת תצוגה" />
      </div>
      {subject === "seats" ? (
        d.seats ? <SeatsStats rows={d.seats.full} polls={d.seats.polls} mine={mine} view={view} /> : <Notice>עדיין אין השערות מנדטים להצגה.</Notice>
      ) : (
        d.blocs ? <BlocStats d={d} view={view} /> : <Notice>עדיין אין השערות גושים להצגה.</Notice>
      )}
    </div>
  );
}

function Toggle<T extends string>({ value, setValue, options, label }: { value: T; setValue: (v:T)=>void; options: readonly (readonly [T,string])[]; label:string }) {
  return <div className="flex gap-1.5" role="radiogroup" aria-label={label}>{options.map(([id,text]) => <button key={id} type="button" role="radio" aria-checked={value===id} onClick={()=>setValue(id)} className={`min-h-[40px] px-4 rounded-full border-2 text-sm font-bold ${value===id ? "bg-ink text-paper-card border-ink" : "bg-paper-card border-paper-line"}`}>{text}</button>)}</div>;
}

function SeatsStats({ rows, polls, mine, view }: { rows: SeatStat[]; polls: Record<string,number>; mine?: SeatsPayload | null; view: View }) {
  const sorted = useMemo(() => [...rows].sort((a,b)=>b.mean-a.mean || b.max-a.max), [rows]);
  if (view === "chart") return <Bars rows={sorted.map(s=>({key:s.list,label:nameOf(s.list),value:s.mean,range:range(s)}))} />;
  return <Card title="מנדטים"><div className="overflow-x-auto"><table className="w-full text-sm tabular whitespace-nowrap">
    <thead><tr className="text-ink-soft"><th className="text-start font-normal">רשימה</th><th className="font-normal">ממוצע</th><th className="font-normal">טווח</th><th className="font-normal">סקרים</th><th className="font-normal">שלי</th></tr></thead>
    <tbody>{sorted.map(s=><tr key={s.list} className="border-t border-paper-line"><td className="py-2">{nameOf(s.list)}</td><td className="text-center font-bold">{seatsFmt(s.mean)}</td><td className="text-center whitespace-nowrap"><bdi dir="ltr">{range(s)}</bdi></td><td className="text-center">{polls[s.list] ?? "—"}</td><td className="text-center">{mine?.seats[s.list]?.v ?? "—"}</td></tr>)}</tbody>
  </table></div></Card>;
}

function BlocStats({ d, view }: { d:D; view:View }) {
  const b=d.blocs!;
  const government=[...GOV_IDS].sort().join(",");
  const rows = [
    ...(b.derived ? [{key:government,label:"גוש הקואליציה",stat:b.derived.gov}] : []),
    ...(b.custom ?? []).filter(g=>g.derived && g.lists.length && [...g.lists].sort().join(",")!==government)
      .map(g=>({key:[...g.lists].sort().join(","),label:g.name || g.lists.map(nameOf).join(" · "),stat:g.derived!}))
      .sort((a,b)=>b.stat.mean-a.stat.mean || a.label.localeCompare(b.label,"he"))
  ];
  if (view==="chart") return <Bars rows={rows.map(r=>({key:r.key,label:r.label,value:r.stat.mean,range:range(r.stat)}))} />;
  return <Card title="גושים"><div className="overflow-x-auto"><table className="w-full text-sm tabular whitespace-nowrap">
    <thead><tr className="text-ink-soft"><th className="text-start font-normal">גוש</th><th className="font-normal">ממוצע</th><th className="font-normal">טווח</th><th className="font-normal">מנחשים</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.key} className="border-t border-paper-line"><th className="text-start py-2 pe-2 font-normal">{r.label}</th><td className="text-center font-bold">{seatsFmt(r.stat.mean)}</td><td className="text-center whitespace-nowrap"><bdi dir="ltr">{range(r.stat)}</bdi></td><td className="text-center">{r.stat.n}</td></tr>)}</tbody>
  </table></div></Card>;
}

function Bars({ rows }: { rows:{key:string;label:string;value:number;range:string}[] }) {
  const max=Math.max(1,...rows.map(r=>r.value));
  return <Card title="גרף"><div className="space-y-3">{rows.map(r=><div key={r.key} className="grid grid-cols-[minmax(6rem,auto)_1fr_auto] gap-2 items-center text-sm"><span className="truncate">{r.label}</span><div className="h-5 rounded-full bg-paper-line overflow-hidden"><div className="h-full bg-ink" style={{width:`${Math.max(2,(r.value/max)*100)}%`}} /></div><span className="font-num tabular whitespace-nowrap"><b>{seatsFmt(r.value)}</b>{r.range ? ` · ${r.range}` : ""}</span></div>)}</div></Card>;
}
