import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import Explained from "./Explained";
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
}

/** כרטיס משותף מרכז כמה מקורות; נתון חסר נשאר חסר והמקורות אינם מתמזגים. */
export default function PersonalBlocs({ title, values = {}, source, asOf, historical = false, mapping, datasets, editTargets = false, compare = false }: {
  title: string; values?: Record<string, number | undefined>; source: string; asOf: string; historical?: boolean; mapping?: Record<string, string>;
  datasets?: BlocDataset[]; editTargets?: boolean; compare?: boolean;
}) {
  const unit = usePersonalBlocs();
  const { pathname, search } = useLocation();
  const p = unit.draft ? normalizeBlocs(unit.draft) : DEFAULT_BLOCS;
  const series = (datasets ?? [{ values, source, asOf, historical, mapping }]).map(d => ({
    ...d, rows: d.rows ?? (d.poll ? pollBlocValues(p.blocs, d.poll, usablePolls) : blocValues(p.blocs, d.values ?? {}, d.mapping ?? (d.historical ? K25_MAP : Object.fromEntries(IDS.map(id => [id, id]))))),
  }));
  if (!p.blocs.some(b => b.lists.length)) return null;
  const anyKnown = series.some(d => d.rows.some(row => row.knownTotal !== null));
  const display = formatBlocValue;
  const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value)) ? date(value) : value;
  const one = series[0];
  const table = series.length > 3 ? <table className="w-full text-sm">
    <caption className="sr-only">מנדטים לפי הגושים שלי בכל מקור</caption>
    <thead><tr className="border-b border-paper-line"><th scope="col" className="text-start py-2 min-w-[12rem]">מקור · תאריך</th>{p.blocs.map(b => <th key={b.id} scope="col" className="px-3 min-w-[7rem] break-words">{b.name}</th>)}</tr></thead>
    <tbody>{series.map((d, i) => <tr key={i} className="border-b border-paper-line"><th scope="row" className="text-start py-2 font-normal">{d.source}<span className="block text-xs text-ink-soft">{displayDate(d.asOf)}</span></th>{p.blocs.map(b => { const row = d.rows.find(r => r.id === b.id); return <td key={b.id} className="text-center px-3 tabular">{display(row)}<BlocCoverage row={row} /></td>; })}</tr>)}</tbody>
  </table> : <table className="w-full text-sm">
    <caption className="sr-only">השוואת מנדטים לפי הגושים שלי</caption>
    <thead><tr className="border-b border-paper-line"><th scope="col" className="text-start min-w-[8rem]">גוש</th>{series.map((d,i) => <th key={i} scope="col" className="px-3 min-w-[7rem] py-2">{d.source}<span className="block font-normal text-xs text-ink-soft">{displayDate(d.asOf)}</span></th>)}{compare && series.length === 2 && <th scope="col" className="px-3">שינוי במנדטים</th>}</tr></thead>
    <tbody>{p.blocs.map(b => { const first = series[0]?.rows.find(r => r.id === b.id)?.total; const last = series[1]?.rows.find(r => r.id === b.id)?.total; const delta = first != null && last != null ? last - first : null; return <tr key={b.id} className="border-b border-paper-line"><th scope="row" className="text-start py-2 break-words">{b.name}<span className="block font-normal text-xs text-ink-soft">{b.lists.map(nameOf).join(" · ") || "אין מפלגות"}</span></th>{series.map((d,i) => { const row = d.rows.find(r => r.id === b.id); return <td key={i} className="px-3 text-center tabular">{display(row)}<BlocCoverage row={row} /></td>; })}{compare && series.length === 2 && <td className="text-center tabular"><bdi>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${seatsFmt(delta)}`}</bdi></td>}</tr>; })}</tbody>
  </table>;
  return <section data-personal-blocs-card className="my-4 rounded-theme border border-paper-line bg-paper-card p-3 space-y-2" aria-label={title}>
    <div className="flex justify-between gap-3 items-center flex-wrap"><h3 className="font-display text-2xl">{title}</h3><Link className="min-h-[44px] flex items-center text-sm font-bold" to={`/guess?section=blocs&return=${encodeURIComponent(pathname + search)}`}>עריכת הרכב הגושים</Link></div>
    <p className="text-xs text-ink-soft">{source} · {asOf}</p>
    <Explained kind="השוואה" source={source} asOf={asOf} assumption="סכום מקור מלא, סכום חלקי (לפחות) ואומדן (כ-) מוצגים בנפרד. השלמה רק מסקרים קודמים קרובים שעברו בדיקת דיוק; המקור לא משתנה. גושים יכולים לחפוף ואין לחברם. אין חיבור טווחי מפלגות או השלמה שרירותית של תוצאות אמת." methodAnchor="personal-blocs">
      {!anyKnown ? <p className="text-sm text-ink-soft">אין נתון תואם למפלגות הגושים במקור הזה. לא ניתן להציג סכום או אומדן אמין.{series.length === 0 && " נסו להרחיב את המסננים."}</p> : series.length === 1 && one ? <dl className="space-y-2">{one.rows.map(row => <div key={row.id} className="flex flex-wrap justify-between gap-3 border-b border-paper-line pb-2 text-sm"><dt className="min-w-0 flex-1"><strong className="break-words">{row.name}</strong><span className="block text-xs text-ink-soft break-words">{row.lists.map(nameOf).join(" · ") || "אין מפלגות"}</span></dt><dd className="font-num tabular font-bold shrink-0 max-w-full">{display(row)} מנדטים<BlocCoverage row={row} />{editTargets && <label className="block font-sans text-xs font-normal mt-1">הצפי שלי<input aria-label={`מנדטים צפויים לגוש ${row.name}`} type="number" min={0} max={120} inputMode="numeric" value={row.target ?? ""} className="block mt-1 w-24 min-h-[44px] rounded-theme border border-paper-line bg-paper text-ink px-2 font-num text-lg" onChange={e => unit.setDraft({ mode: "custom", blocs: p.blocs.map(b => b.id === row.id ? { ...b, target: e.target.value === "" ? null : Math.max(0, Math.min(120, Math.round(Number(e.target.value) || 0))) } : b) })} /></label>}</dd></div>)}</dl> : series.length > 0 ? <>{series.length > 6 && <ul className="text-xs text-ink-soft space-y-1">{p.blocs.map(b => <li key={b.id}><b>{b.name}:</b> {b.lists.map(nameOf).join(" · ") || "אין מפלגות"}</li>)}</ul>}{series.length > 6 ? <details><summary className="cursor-pointer min-h-[44px] flex items-center font-bold">נתוני הגושים בכל {series.length} המקורות</summary><div className="overflow-x-auto">{table}</div></details> : <div className="overflow-x-auto">{table}</div>}</> : <p>אין נתונים להצגה לפי המסננים שנבחרו.</p>}
    </Explained>
    {compare && <p className="text-xs text-ink-soft">שינוי במנדטים מחושב רק כששני המקורות מלאים.</p>}
    {editTargets && <p className="text-xs text-ink-soft">הצפי הוא יעד להשערה. ״השלם הכול״ יציע חלוקת מפלגות שמתאימה ליעדים; השמירה שומרת גם את הצפי. עריכת ההרכב נעשית בלשונית ״לפי גושים״.</p>}
    <p className="text-xs text-ink-soft">תרחישים עצמאיים וחופפים; אין לחבר את סכומיהם. {unit.status !== "saved" ? "הרכב הגושים הוא טיוטה בדפדפן הזה." : "לפי הרכב הגושים השמור שלכם."}</p>
  </section>;
}

function BlocCoverage({ row }: { row?: BlocRow }) {
  if (!row?.missing.length) return null;
  return <div className="mt-1 text-xs font-sans font-normal text-ink-soft whitespace-normal break-words max-w-xs">
    <span className="block">נתון ל-{row.knownCount} מתוך {row.lists.length} מפלגות</span>
    <span className="block">{row.estimate !== null ? "הושלם" : "חסר נתון או אין התאמה"}: {row.missing.map(nameOf).join(" · ")}</span>
    {row.imputed.length ? <details className="mt-1"><summary className="cursor-pointer min-h-[44px] flex items-center">מקורות האומדן</summary><ul className="space-y-1">{row.imputed.map(c=><li key={c.id}>{nameOf(c.id)}: {seatsFmt(c.value)} מנדטים · {c.method === "same-firm" ? "סקר קודם של אותו מכון ומזמין" : "חציון המכונים הקודמים"}{c.sources.map(source=><span key={source.id} className="block">{source.label} · {date(source.date)}</span>)}</li>)}</ul></details> : row.reason && <span className="block">{row.reason}</span>}
  </div>;
}
