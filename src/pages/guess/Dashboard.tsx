import PersonalBlocs from "../../components/PersonalBlocs";
import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui";
import { liveDashboard, newerDashboard, siteDashboard, type Cell, type Dashboard as D, type SeatStat, type SeatsPayload } from "../../lib/crowdApi";
import { loadDraft } from "../../lib/crowdSession";
import { date, seatsFmt } from "../../lib/format";
import { GOV_IDS, k25VoteName, nameOf, POLL_SHARES, V2022_LABEL, V2026_LABEL } from "./model";
import { voteContinuity } from "./voteContinuity";
import { votingRows } from "./votingRows";
import { Notice } from "./ui";
import type { useSession } from "./useCrowd";

type Subject = "seats" | "pct";
type View = "table" | "chart";

const range = (s: SeatStat) => s.min === s.max ? "" : `${seatsFmt(s.min)}–${seatsFmt(s.max)}`;
const v2026Name = (k: string) => V2026_LABEL[k] ?? nameOf(k);
const v2022Name = (k: string) => V2022_LABEL[k] ?? k25VoteName(k);
const time = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const pctOf = (cell: Cell) => cell.of ? Math.round((cell.n / cell.of) * 1000) / 10 : 0;

export default function Dashboard({ session }: { session: ReturnType<typeof useSession> }) {
  const [d, setD] = useState<D | null>(null);
  const [subject, setSubject] = useState<Subject>("seats");
  const [view, setView] = useState<View>("table");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void session.refresh(); }, [session.refresh]);
  // העותק שבאתר מוצג לכולם, גם בלי חיבור לשרת; הנתונים מהשרת מחליפים אותו כשהם חדשים יותר.
  useEffect(() => {
    let alive = true;
    let shown = false;
    const show = (x: D) => { if (!alive) return; shown = true; setD(prev => newerDashboard(prev, x)); };
    void Promise.allSettled([siteDashboard().then(show), liveDashboard().then(show)])
      .then(() => { if (alive && !shown) setErr("הסטטיסטיקות אינן זמינות כרגע. נסו שוב בעוד כמה דקות."); });
    return () => { alive = false; };
  }, []);

  if (err) return <Notice tone="warn">{err}</Notice>;
  if (!d) return <p className="text-ink-soft">טוען…</p>;

  const asOf = d.publishedAt ? `${date(d.publishedAt)}, ${time(d.publishedAt)}` : "הפרסום האחרון";
  const mine = loadDraft<SeatsPayload>("seats") ?? session.me?.latest.seats?.payload as SeatsPayload | undefined;
  return (
    <div>
      {d.participants < 30 && <div className="mb-4"><Notice tone="warn">מעט משתתפים — הנתונים אינם מייצגים את הציבור.</Notice></div>}
      <p className="font-display text-2xl mb-1">{d.participants} משתתפים בסך הכול</p>
      {d.publishedAt && <p className="text-sm text-ink-soft mb-4">נכון ל־{asOf}</p>}
      {d.seats && <PersonalBlocs title="הגושים שלי: ממוצע המשתתפים מול הסקרים וההשערה שלי" source="השוואת הגושים: גולשים, סקרים וההשערה שלי" asOf={asOf} datasets={[
        { values: Object.fromEntries(d.seats.full.map(row => [row.list, row.mean])), source: `ממוצע ${d.seats.n} המשתתפים`, asOf },
        { values: d.seats.polls, source: "הסקרים", asOf: d.seats.pollsAsOf ?? "הפרסום האחרון" },
        ...(mine ? [{ values: Object.fromEntries(Object.entries(mine.seats).map(([id,c]) => [id,c.v])), source: "ההשערה שלי", asOf: "הטיוטה הנוכחית" }] : []),
      ]} />}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Toggle value={subject} setValue={setSubject} options={[["seats","מנדטים"],["pct","אחוזים"]]} label="סוג נתון" />
        <Toggle value={view} setValue={setView} options={[["table","טבלה"],["chart","גרף"]]} label="צורת תצוגה" />
      </div>
      {subject === "seats" ? (
        d.seats ? <SeatsStats rows={d.seats.full} polls={d.seats.polls} mine={mine} view={view} /> : <Notice>עדיין אין השערות מנדטים להצגה.</Notice>
      ) : (
        d.seats?.pctStats ? <SeatsStats rows={d.seats.pctStats} polls={POLL_SHARES} mine={mine} view={view} unit="pct" /> : <Notice>עדיין אין השערות לפי אחוזים להצגה.</Notice>
      )}
      {d.blocs ? <BlocStats d={d} view={view} /> : <Notice>עדיין אין השערות גושים להצגה.</Notice>}
      {(d.vote2026 || d.vote2022 || d.matrix || d.byVote) && <VotingStats d={d} />}
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return <span className="flex flex-wrap justify-between items-baseline gap-x-4 gap-y-1"><span>{title}</span><span className="text-2xl tabular">{count ?? "—"} משתתפים</span></span>;
}

function Toggle<T extends string>({ value, setValue, options, label }: { value: T; setValue: (v:T)=>void; options: readonly (readonly [T,string])[]; label:string }) {
  return <div className="flex gap-1.5" role="radiogroup" aria-label={label}>{options.map(([id,text]) => <button key={id} type="button" role="radio" aria-checked={value===id} onClick={()=>setValue(id)} className={`min-h-[40px] px-4 rounded-full border-2 text-sm font-bold ${value===id ? "bg-ink text-paper-card border-ink" : "bg-paper-card border-paper-line"}`}>{text}</button>)}</div>;
}

export function SeatsStats({ rows, polls, mine, view, unit = "seats" }: { rows: SeatStat[]; polls: Record<string,number>; mine?: SeatsPayload | null; view: View; unit?: Subject }) {
  const sorted = useMemo(() => [...rows].sort((a,b)=>b.mean-a.mean || b.max-a.max), [rows]);
  const suffix = unit === "pct" ? "%" : "";
  const format = (n: number) => `${seatsFmt(n)}${suffix}`;
  const myValue = (id: string) => unit === "pct" ? mine?.mode === "pct" ? mine.pct?.[id] : undefined : mine?.seats[id]?.v;
  if (view === "chart") return <Bars suffix={suffix} title={<SectionTitle title={unit === "pct" ? "אחוזים" : "מנדטים"} count={rows[0]?.n ?? 0} />} rows={sorted.map(s=>({key:s.list,label:nameOf(s.list),value:s.mean,range:range(s)}))} />;
  return <Card title={<SectionTitle title={unit === "pct" ? "אחוזים" : "מנדטים"} count={rows[0]?.n ?? 0} />}><div className="overflow-x-auto"><table className="w-full text-sm tabular whitespace-nowrap">
    <thead><tr className="text-ink-soft"><th className="text-start font-normal">רשימה</th><th className="font-normal">ממוצע</th><th className="font-normal">טווח</th><th className="font-normal">סקרים</th><th className="font-normal">שלי</th></tr></thead>
    <tbody>{sorted.map(s=><tr key={s.list} className="border-t border-paper-line"><td className="py-2">{nameOf(s.list)}</td><td className="text-center font-bold">{format(s.mean)}</td><td className="text-center whitespace-nowrap"><bdi dir="ltr">{range(s) ? `${range(s)}${suffix}` : ""}</bdi></td><td className="text-center">{polls[s.list] === undefined ? "—" : format(polls[s.list])}</td><td className="text-center">{myValue(s.list) === undefined ? "—" : format(myValue(s.list)!)}</td></tr>)}</tbody>
  </table></div></Card>;
}

export function BlocStats({ d, view }: { d:D; view:View }) {
  const b=d.blocs!;
  const government=[...GOV_IDS].sort().join(",");
  const rows = [
    ...(b.derived ? [{key:government,lists:GOV_IDS,label:"גוש הקואליציה",stat:b.derived.gov}] : []),
    ...(b.custom ?? []).filter(g=>g.derived && g.n >= 2 && g.lists.length && [...g.lists].sort().join(",")!==government)
      .map(g=>({key:[...g.lists].sort().join(","),lists:g.lists,label:g.lists.map(nameOf).join(" · "),stat:g.derived!}))
  ].filter(row => {
    const listCount = new Set(row.lists).size;
    return listCount >= 2 && row.stat.mean >= 4 * listCount;
  }).sort((a,b) => b.stat.n-a.stat.n || b.stat.mean-a.stat.mean || a.label.localeCompare(b.label,"he"));
  if (!rows.length) return <Notice>עדיין אין גושים עם לפחות שתי רשימות וממוצע של לפחות 4 מנדטים לרשימה.</Notice>;
  if (view==="chart") return <Bars title={<SectionTitle title="גושים" count={d.sectionParticipants?.blocs} />} rows={rows.map(r=>({key:r.key,label:r.label,value:r.stat.mean,range:range(r.stat)}))} />;
  return <Card title={<SectionTitle title="גושים" count={d.sectionParticipants?.blocs} />}><div className="overflow-x-auto"><table className="w-full text-sm tabular whitespace-nowrap">
    <thead><tr className="text-ink-soft"><th className="text-start font-normal">גוש</th><th className="font-normal">ממוצע</th><th className="font-normal">טווח</th><th className="font-normal">משתתפים</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.key} className="border-t border-paper-line"><th className="text-start py-2 pe-2 font-normal whitespace-normal min-w-32">{r.label}</th><td className="text-center font-bold">{seatsFmt(r.stat.mean)}</td><td className="text-center whitespace-nowrap"><bdi dir="ltr">{range(r.stat)}</bdi></td><td className="text-center">{r.stat.n}</td></tr>)}</tbody>
  </table></div></Card>;
}

function Bars({ rows, suffix = "", title = "גושים" }: { rows:{key:string;label:string;value:number;range:string}[]; suffix?: string; title?: import("react").ReactNode }) {
  const max=Math.max(1,...rows.map(r=>r.value));
  return <Card title={title}><div className="space-y-3">{rows.map(r=><div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center text-sm"><span className="break-words">{r.label}</span><div className="h-5 rounded-full bg-paper-line overflow-hidden"><div className="h-full bg-ink" style={{width:`${Math.max(2,(r.value/max)*100)}%`}} /></div><span className="font-num tabular whitespace-nowrap"><b>{seatsFmt(r.value)}{suffix}</b>{r.range ? ` · ${r.range}${suffix}` : ""}</span></div>)}</div></Card>;
}


export function VotingStats({ d }: { d: D }) {
  const count = d.sectionParticipants?.vote2026 ?? d.sectionParticipants?.vote2022;
  return <Card title={<SectionTitle title="הצבעה וכוונות הצבעה" count={count} />}>
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
  const continuity = voteContinuity(m);
  const cols = [...new Set(Object.values(m.rows).flatMap((r) => Object.keys(r.cells)))];
  return <div>
    {continuity.total > 0 && <p className="text-sm mb-3">לא שינו בחירה: <strong>{continuity.same}</strong> · שינו בחירה: <strong>{continuity.changed}</strong>. הציונות הדתית ב־2022 והציונות הדתית/זהות ב־2026 נספרות כאותה בחירה.</p>}
    <div className="overflow-x-auto">
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
    </div>
  </div>;
}

// תאימות לבדיקות הרכיבים הוותיקות בזמן המעבר לדשבורד המאוחד.
export const StatTable = ({ rows, polls, mine }: { rows: SeatStat[]; polls: Record<string, number>; mine?: SeatsPayload | null }) => <SeatsStats rows={rows} polls={polls} mine={mine} view="table" />;
export const BlocsBlock = ({ d }: { d: D }) => <BlocStats d={d} view="table" />;
