import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui";
import { call, type Cell, type Dashboard as D, type SeatStat, type SeatsPayload } from "../../lib/crowdApi";
import { loadDraft } from "../../lib/crowdSession";
import { seatsFmt } from "../../lib/format";
import { GOV_IDS, k25Name, nameOf, V2022_LABEL, V2026_LABEL } from "./model";
import { votingRows } from "./votingRows";
import { Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

type Subject = "seats" | "blocs";
type View = "table" | "chart";

const range = (s: SeatStat) => s.min === s.max ? "" : `${seatsFmt(s.min)}–${seatsFmt(s.max)}`;
const v2026Name = (k: string) => V2026_LABEL[k] ?? nameOf(k);
const v2022Name = (k: string) => V2022_LABEL[k] ?? k25Name(k);
const pctOf = (cell: Cell) => cell.of ? Math.round((cell.n / cell.of) * 1000) / 10 : 0;

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
      {(d.vote2026 || d.vote2022 || d.matrix || d.byVote) && <VotingStats d={d} />}
    </div>
  );
}

function Toggle<T extends string>({ value, setValue, options, label }: { value: T; setValue: (v:T)=>void; options: readonly (readonly [T,string])[]; label:string }) {
  return <div className="flex gap-1.5" role="radiogroup" aria-label={label}>{options.map(([id,text]) => <button key={id} type="button" role="radio" aria-checked={value===id} onClick={()=>setValue(id)} className={`min-h-[40px] px-4 rounded-full border-2 text-sm font-bold ${value===id ? "bg-ink text-paper-card border-ink" : "bg-paper-card border-paper-line"}`}>{text}</button>)}</div>;
}

export function SeatsStats({ rows, polls, mine, view }: { rows: SeatStat[]; polls: Record<string,number>; mine?: SeatsPayload | null; view: View }) {
  const sorted = useMemo(() => [...rows].sort((a,b)=>b.mean-a.mean || b.max-a.max), [rows]);
  if (view === "chart") return <Bars rows={sorted.map(s=>({key:s.list,label:nameOf(s.list),value:s.mean,range:range(s)}))} />;
  return <Card title="מנדטים"><div className="overflow-x-auto"><table className="w-full text-sm tabular whitespace-nowrap">
    <thead><tr className="text-ink-soft"><th className="text-start font-normal">רשימה</th><th className="font-normal">ממוצע</th><th className="font-normal">טווח</th><th className="font-normal">סקרים</th><th className="font-normal">שלי</th></tr></thead>
    <tbody>{sorted.map(s=><tr key={s.list} className="border-t border-paper-line"><td className="py-2">{nameOf(s.list)}</td><td className="text-center font-bold">{seatsFmt(s.mean)}</td><td className="text-center whitespace-nowrap"><bdi dir="ltr">{range(s)}</bdi></td><td className="text-center">{polls[s.list] ?? "—"}</td><td className="text-center">{mine?.seats[s.list]?.v ?? "—"}</td></tr>)}</tbody>
  </table></div></Card>;
}

export function BlocStats({ d, view }: { d:D; view:View }) {
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


function VotingStats({ d }: { d: D }) {
  return <Card title="הצבעה וכוונות הצבעה">
    <VoteComparison d={d} />
    {d.matrix && <section className="mt-6"><h3 className="font-bold mb-2">מעבר 2022–2026</h3><Matrix d={d} /></section>}
  </Card>;
}

function VoteComparison({ d }: { d: D }) {
  const rows = votingRows(d);
  return <div className="overflow-x-auto"><table className="w-full table-fixed text-xs sm:text-sm tabular">
    <thead><tr className="text-ink-soft"><th className="text-start w-[28%]">רשימה</th><th>בחירות קודמות — כלל המצביעים</th><th>בחירות קודמות — הצביעו מהמשתתפים</th><th>בחירות הבאות — מתכננים להצביע</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.key} className="border-t border-paper-line"><th className="text-start font-normal py-2 pe-1 break-words">{r.name}</th>{[r.official, r.previous, r.next].map((v,i) => <td key={i} className="text-center">{v === null ? "—" : `${v}%`}</td>)}</tr>)}</tbody>
  </table></div>;
}

function Matrix({ d }: { d: D }) {
  const m = d.matrix!;
  const cols = [...new Set(Object.values(m.rows).flatMap((r) => Object.keys(r.cells)))];
  return <div className="overflow-x-auto">
    <table className="text-xs tabular min-w-full border-collapse">
      <thead>
        <tr>
          <th rowSpan={2} className="text-start p-1 sticky start-0 bg-paper-card align-bottom border-b border-paper-line">
            <span className="block text-ink-soft font-normal">2022</span>
          </th>
          <th colSpan={Math.max(cols.length, 1)} className="p-1 text-center font-bold">2026</th>
        </tr>
        <tr className="border-b border-paper-line">
          {cols.map((col) => <th key={col} className="p-1 font-normal text-ink-soft whitespace-nowrap">{v2026Name(col)}</th>)}
        </tr>
      </thead>
      <tbody>
        {Object.entries(m.rows).map(([key, row]) => <tr key={key} className="border-t border-paper-line">
          <th className="text-start p-1 font-bold whitespace-nowrap sticky start-0 bg-paper-card">{v2022Name(key)}</th>
          {cols.map((col) => {
            const cell = row.cells[col];
            const hidden = row.hidden || !cell || cell.hidden;
            return <td key={col} className={`p-1 text-center ${hidden ? "text-ink-faint" : ""}`}>{hidden ? "—" : `${pctOf(cell)}%`}</td>;
          })}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

// תאימות לבדיקות הרכיבים הוותיקות בזמן המעבר לדשבורד המאוחד.
export const StatTable = ({ rows, polls, mine }: { rows: SeatStat[]; polls: Record<string, number>; mine?: SeatsPayload | null }) => <SeatsStats rows={rows} polls={polls} mine={mine} view="table" />;
export const BlocsBlock = ({ d }: { d: D }) => <BlocStats d={d} view="table" />;
