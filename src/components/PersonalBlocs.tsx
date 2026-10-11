import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Explained from "./Explained";
import EditBlocsButton, { BlocNameToggle } from "./EditBlocsButton";
import type { BlocsPayload } from "../lib/crowdApi";
import { useSession, useUnit } from "../pages/guess/useCrowd";
import { DEFAULT_BLOCS, IDS, K25_MAP, nameOf, normalizeBlocs } from "../pages/guess/model";
import { seatsFmt } from "../lib/format";
import { blocValues, formatBlocValue, type BlocRow } from "../lib/personalBlocs";
import { pollBlocValues } from "../lib/blocEstimates";
import { usablePolls, type Poll } from "../lib/data";
import { date } from "../lib/format";

const Context = createContext<ReturnType<typeof useUnit<BlocsPayload>> | null>(null);
export function PersonalBlocsProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const unit = useUnit<BlocsPayload>("blocs", DEFAULT_BLOCS, session.me?.latest.blocs?.payload as BlocsPayload | undefined);
  useEffect(() => { if (!unit.draft) return; const n = normalizeBlocs(unit.draft); if (n !== unit.draft) unit.setDraft(n); }, [unit.draft, unit.setDraft]);
  return <Context.Provider value={unit}>{children}</Context.Provider>;
}
export function usePersonalBlocs() {
  const unit = useContext(Context);
  if (!unit) throw new Error("PersonalBlocsProvider missing");
  return unit;
}
export type { BlocRow } from "../lib/personalBlocs";
export interface BlocDataset {
  values?: Record<string, number | undefined>;
  source: string;
  asOf: string;
  historical?: boolean;
  mapping?: Record<string, string>;
  rows?: BlocRow[];
  poll?: Poll;
  sumAvailable?: boolean;
}

/** כרטיס משותף מרכז כמה מקורות; נתון חסר נשאר חסר והמקורות אינם מתמזגים. */
export default function PersonalBlocs({ title, values = {}, source, asOf, historical = false, mapping, datasets, editTargets = false, compare = false, compact = false }: {
  title: string; values?: Record<string, number | undefined>; source: string; asOf: string; historical?: boolean; mapping?: Record<string, string>;
  datasets?: BlocDataset[]; editTargets?: boolean; compare?: boolean;
  /** טור צר: לכל גוש רשימת מקורות זה מתחת לזה, במקום טבלה רחבה */
  compact?: boolean;
}) {
  const unit = usePersonalBlocs();
  const { pathname, search } = useLocation();
  const definition = unit.draft ? normalizeBlocs(unit.draft) : DEFAULT_BLOCS;
  const p = { ...definition, blocs: definition.blocs.map((b, i) => ({ ...b, name: b.name.trim() || `גוש ${i + 1}` })) };
  const series = (datasets ?? [{ values, source, asOf, historical, mapping }]).map(d => ({
    ...d, rows: d.rows ?? (d.poll ? pollBlocValues(p.blocs, d.poll, usablePolls) : blocValues(p.blocs, d.values ?? {}, d.mapping ?? (d.historical ? K25_MAP : Object.fromEntries(IDS.map(id => [id, id]))))),
  }));
  for (const d of series) {
    if (d.sumAvailable) d.rows = d.rows.map(row => ({ ...row, total: row.knownTotal ?? 0, missing: [], estimate: null, imputed: [] }));
  }
  if (!p.blocs.some(b => b.lists.length)) return null;
  const anyKnown = series.some(d => d.rows.some(row => row.knownTotal !== null));
  const display = formatBlocValue;
  const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value)) ? date(value) : value;
  const one = series[0];
  const stacked = <table className="w-full table-fixed text-xs">
    <caption className="sr-only">הגושים שלי מול המשתתפים והסקרים</caption>
    <thead><tr className="border-b border-paper-line"><th className="text-start w-[36%] py-1">גוש</th>{series.map((d,i) => <th key={i} className="px-1 font-normal" title={`${d.source} · ${displayDate(d.asOf)}`}>{d.source.includes("המשתתפים") ? "משתתפים" : d.source === "ההשערה שלי" ? "שלי" : d.source}</th>)}</tr></thead>
    <tbody>{p.blocs.map(b => <tr key={b.id} className="border-b border-paper-line"><th scope="row" className="text-start py-1.5 pe-1 font-normal break-words"><BlocNameToggle name={b.name} lists={b.lists.map(nameOf).join(" · ")} /></th>{series.map((d,i) => { const row = d.rows.find(r => r.id === b.id); return <td key={i} className="text-center px-1 tabular font-bold">{display(row)}{row?.missing.length ? <span title={row.missing.map(nameOf).join(" · ")} className="block text-[10px] font-normal">חסר {row.missing.length}/{row.lists.length}</span> : null}</td>; })}</tr>)}</tbody>
  </table>;
  const table = compact ? stacked : series.length > 3 ? <table className="w-full text-sm">
    <caption className="sr-only">מנדטים לפי הגושים שלי בכל מקור</caption>
    <thead><tr className="border-b border-paper-line"><th scope="col" className="text-start py-2 min-w-[12rem]">מקור · תאריך</th>{p.blocs.map(b => <th key={b.id} scope="col" className="px-3 min-w-[7rem] break-words">{b.name}</th>)}</tr></thead>
    <tbody>{series.map((d, i) => <tr key={i} className="border-b border-paper-line"><th scope="row" className="text-start py-2 font-normal">{d.source}<span className="block text-xs text-ink-soft">{displayDate(d.asOf)}</span></th>{p.blocs.map(b => { const row = d.rows.find(r => r.id === b.id); return <td key={b.id} className="text-center px-3 tabular">{display(row)}<BlocCoverage row={row} /></td>; })}</tr>)}</tbody>
  </table> : <table className="w-full text-sm">
    <caption className="sr-only">השוואת מנדטים לפי הגושים שלי</caption>
    <thead><tr className="border-b border-paper-line"><th scope="col" className="text-start min-w-[8rem]">גוש</th>{series.map((d,i) => <th key={i} scope="col" className="px-3 min-w-[7rem] py-2">{d.source}<span className="block font-normal text-xs text-ink-soft">{displayDate(d.asOf)}</span></th>)}{compare && series.length === 2 && <th scope="col" className="px-3">שינוי במנדטים</th>}</tr></thead>
    <tbody>{p.blocs.map(b => { const first = series[0]?.rows.find(r => r.id === b.id)?.total; const last = series[1]?.rows.find(r => r.id === b.id)?.total; const delta = first != null && last != null ? last - first : null; return <tr key={b.id} className="border-b border-paper-line"><th scope="row" className="text-start py-2 break-words"><BlocNameToggle name={b.name} lists={b.lists.map(nameOf).join(" · ")} /></th>{series.map((d,i) => { const row = d.rows.find(r => r.id === b.id); return <td key={i} className="px-3 text-center tabular">{display(row)}<BlocCoverage row={row} /></td>; })}{compare && series.length === 2 && <td className="text-center tabular"><bdi>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${seatsFmt(delta)}`}</bdi></td>}</tr>; })}</tbody>
  </table>;
  return <section data-personal-blocs-card className="my-4 rounded-theme border border-paper-line bg-paper-card p-3 space-y-2" aria-label={title}>
    <div className="flex justify-between gap-3 items-center flex-wrap"><h3 className={`font-display ${compact ? "text-lg leading-tight" : "text-2xl"}`}>{title}</h3><EditBlocsButton returnTo={pathname + search} /></div>
    {!editTargets && <p className="text-xs text-ink-soft">{source} · {asOf}</p>}
    <Explained kind="השוואה" source={source} asOf={asOf} assumption="סכום מקור מלא, סכום חלקי (לפחות) ואומדן (כ-) מוצגים בנפרד. השלמה רק מסקרים קודמים קרובים שעברו בדיקת דיוק; המקור לא משתנה. גושים יכולים לחפוף ואין לחברם. אין חיבור טווחי מפלגות או השלמה שרירותית של תוצאות אמת." methodAnchor="personal-blocs">
      {!anyKnown ? <p className="text-sm text-ink-soft">אין נתון תואם למפלגות הגושים במקור הזה. לא ניתן להציג סכום או אומדן אמין.{series.length === 0 && " נסו להרחיב את המסננים."}</p> : series.length === 1 && one ? <dl className="space-y-2">{one.rows.map(row => <div key={row.id} className="flex flex-wrap justify-between items-start gap-x-4 gap-y-2 border-b border-paper-line pb-2 text-sm"><dt className="min-w-0 flex-1 basis-40"><BlocNameToggle name={row.name} lists={row.lists.map(nameOf).join(" · ")} /></dt><dd className="flex flex-wrap items-end gap-x-4 gap-y-1 max-w-full"><span className="font-num tabular font-bold">{display(row)} מנדטים<BlocCoverage row={row} /></span>{editTargets && <label className="font-sans text-xs font-normal flex flex-col">הצפי שלי<input aria-label={`מנדטים צפויים לגוש ${row.name}`} type="number" min={0} max={120} inputMode="numeric" value={row.target ?? ""} className="mt-1 w-24 min-h-[44px] rounded-theme border border-paper-line bg-paper text-ink px-2 font-num text-lg" onChange={e => unit.setDraft({ mode: "custom", schemaVersion: 2, blocs: p.blocs.map(b => b.id === row.id ? { ...b, target: e.target.value === "" ? null : Math.max(0, Math.min(120, Math.round(Number(e.target.value) || 0))) } : b) })} /></label>}</dd></div>)}</dl> : series.length > 0 ? <>{series.length > 6 && <ul className="text-xs text-ink-soft space-y-1">{p.blocs.map(b => <li key={b.id}><b>{b.name}:</b> {b.lists.map(nameOf).join(" · ") || "אין מפלגות"}</li>)}</ul>}{series.length > 6 ? <details><summary className="cursor-pointer min-h-[44px] flex items-center font-bold">נתוני הגושים בכל {series.length} המקורות</summary><div className="overflow-x-auto">{table}</div></details> : <div className="overflow-x-auto">{table}</div>}</> : <p>אין נתונים להצגה לפי המסננים שנבחרו.</p>}
    </Explained>
    {compare && <p className="text-xs text-ink-soft">שינוי במנדטים מחושב רק כששני המקורות מלאים.</p>}
    {editTargets ? <p className="text-xs text-ink-soft">״השלם הכול״ מתאים את המספר בכל מפלגה לצפי שלכם לגוש. הגושים הם תרחישים נפרדים, ומפלגה יכולה להופיע ביותר מגוש, ולכן אין לחבר את הסכומים.</p> : <p className="text-xs text-ink-soft">תרחישים עצמאיים וחופפים; אין לחבר את סכומיהם. {unit.status !== "saved" ? "הרכב הגושים הוא טיוטה בדפדפן הזה." : "לפי הרכב הגושים השמור שלכם."}</p>}
  </section>;
}

/** שורה קצרצרה מתחת לנתון חסר (הכרעת בעלים 8.10.2026); שמות המפלגות ומקורות האומדן — בריחוף ולקורא מסך */
function BlocCoverage({ row }: { row?: BlocRow }) {
  if (!row?.missing.length) return null;
  const detail = [
    `${row.estimate !== null ? "הושלם באומדן" : "חסר נתון או אין התאמה"}: ${row.missing.map(nameOf).join(" · ")}`,
    ...row.imputed.map(c => `${nameOf(c.id)}: ${seatsFmt(c.value)} מנדטים · ${c.method === "same-firm" ? "סקר קודם של אותו מכון ומזמין" : "ממוצע המכונים הקודמים"} · ${c.sources.map(x => `${x.label} ${date(x.date)}`).join(", ")}`),
  ].join("\n");
  return <span className="block mt-0.5 text-xs font-sans font-normal text-ink-soft whitespace-nowrap" title={detail}>
    חסר נתון על <bdi>{row.missing.length}/{row.lists.length}</bdi> מפלגות{row.estimate !== null ? " · אומדן" : ""}
    <span className="sr-only">. {detail}</span>
  </span>;
}
