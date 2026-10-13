import { resolveData, resolveSupportMetric, type Selection } from "../lib/dataResolver";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Explained from "./Explained";
import BlocsDrawer from "./BlocsDrawer";
import { BlocAvatar } from "./BlocAvatar";
import type { Bloc, BlocsPayload } from "../lib/crowdApi";
import { useSession, useUnit } from "../pages/guess/useCrowd";
import { DEFAULT_BLOCS, IDS, K25_MAP, normalizeBlocs } from "../pages/guess/model";
import { pctOne, seatsFmt } from "../lib/format";
import { blocComparable, blocValues, formatBlocValue, historicalBlocValues, pollBlocValues, type BlocRow } from "../lib/personalBlocs";
import { diffText } from "../lib/dumbbell";
import { type Poll } from "../lib/data";
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
  selection?: Selection;
  values?: Record<string, number | undefined>;
  source: string;
  asOf: string;
  historical?: boolean;
  mapping?: Record<string, string>;
  rows?: BlocRow[];
  poll?: Poll;
  sumAvailable?: boolean;
  /** תוצאות עבר לפי משפחות שיוך (`k25Families`): `values` לפי אותיות רשימות העבר; רשימה של היום בלי שיוך נספרת 0 */
  families?: { k26: string[]; k25: string[] }[];
}

/** גושים בתוצאות עבר לפי משפחות השיוך: רשימה של היום שאינה באף משפחה (חדשה) נספרת 0 */
function familyRows(blocs: Bloc[], families: { k26: string[]; k25: string[] }[], values: Record<string, number | undefined>): BlocRow[] {
  const inFamily = new Set(families.flatMap(f => f.k26));
  const known = Object.fromEntries(Object.entries(values).filter((e): e is [string, number] => typeof e[1] === "number"));
  return historicalBlocValues(blocs.map(b => ({ ...b, lists: b.lists.filter(id => inFamily.has(id)) })), families, known)
    .map((row, i) => {
      const lists = [...new Set(blocs[i].lists)];
      return !row.lists.length && lists.length ? { ...row, lists, total: 0 } : { ...row, lists };
    });
}

/** כרטיס משותף מרכז כמה מקורות; נתון חסר נשאר חסר והמקורות אינם מתמזגים. */
export default function PersonalBlocs({ title, values = {}, source, asOf, historical = false, mapping, datasets, editTargets = false, compare = false, compact = false, unit: shown = "seats" }: {
  title: string; values?: Record<string, number | undefined>; source: string; asOf: string; historical?: boolean; mapping?: Record<string, string>;
  datasets?: BlocDataset[]; editTargets?: boolean; compare?: boolean;
  /** מנדטים (ברירת מחדל) או אחוזים: ב"מה השתנה" מתג אחד קובע לכל המסך. הערכים ב-`values` הם ביחידה הזאת. */
  unit?: "seats" | "pct";
  /** טור צר: לכל גוש רשימת מקורות זה מתחת לזה, במקום טבלה רחבה */
  compact?: boolean;
}) {
  const unit = usePersonalBlocs();
  const { pathname, search } = useLocation();
  const definition = unit.draft ? normalizeBlocs(unit.draft) : DEFAULT_BLOCS;
  const p = { ...definition, blocs: definition.blocs.map((b, i) => ({ ...b, name: b.name.trim() || `גוש ${i + 1}` })) };
  const series = (datasets ?? [{ values, source, asOf, historical, mapping }]).map(d => ({
    ...d, rows: d.rows ?? (d.selection ? p.blocs.map(b => ({ ...b, total: (shown === "pct" ? resolveSupportMetric : resolveData)(d.selection!, b.lists).value })) : d.families ? familyRows(p.blocs, d.families, d.values ?? {}) : d.poll ? pollBlocValues(p.blocs, d.poll) : blocValues(p.blocs, d.values ?? {}, d.mapping ?? (d.historical ? K25_MAP : Object.fromEntries(IDS.map(id => [id, id]))))),
  }));
  for (const d of series) {
    if (d.sumAvailable) d.rows = d.rows.map(row => ({ ...row, total: row.total ?? 0 }));
  }
  if (!p.blocs.some(b => b.lists.length)) return null;
  const anyKnown = series.some(d => d.rows.some(row => row.total !== null));
  const pct = shown === "pct";
  const fmt = pct ? pctOne : seatsFmt;
  const display = (row?: BlocRow) => formatBlocValue(row, fmt);
  const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value)) ? date(value) : value;
  const one = series[0];
  /** בלי תאריך בכרטיס (הכרעת בעלים 11.10.2026); רק כששני מקורות נושאים אותו שם התאריך הוא מה שמבדיל ביניהם */
  const labelOf = (d: (typeof series)[number]) => series.filter(x => x.source === d.source).length > 1 ? `${d.source} · ${displayDate(d.asOf)}` : d.source;
  const stacked = <table className="w-full table-fixed text-xs">
    <caption className="sr-only">הגושים שלי מול המשתתפים והסקרים</caption>
    <thead><tr className="border-b border-paper-line"><th className="text-start w-[36%] py-1">גוש</th>{series.map((d,i) => <th key={i} className="px-1 font-normal" title={labelOf(d)}>{d.source.includes("המשתתפים") ? "משתתפים" : d.source === "ההשערה שלי" ? "שלי" : labelOf(d)}</th>)}</tr></thead>
    <tbody>{p.blocs.map(b => <BlocTableRow key={b.id} id={b.id} lists={b.lists} name={b.name} nameClass="text-start py-1.5 pe-1 font-normal break-words" cellClass="text-center px-1 tabular font-bold">{series.map((d) => { const row = d.rows.find(r => r.id === b.id); return display(row); })}</BlocTableRow>)}</tbody>
  </table>;
  const table = compact ? stacked : series.length > 3 ? <table className="w-full text-sm">
    <caption className="sr-only">מנדטים לפי הגושים שלי בכל מקור</caption>
    <thead><tr className="border-b border-paper-line"><th scope="col" className="text-start py-2 min-w-[12rem]">מקור · תאריך</th>{p.blocs.map(b => <th key={b.id} scope="col" className="px-3 min-w-[7rem] break-words">{b.name}<BlocAvatar id={b.id} lists={b.lists} size={22} center /></th>)}</tr></thead>
    <tbody>{series.map((d, i) => <tr key={i} className="border-b border-paper-line"><th scope="row" className="text-start py-2 font-normal">{labelOf(d)}</th>{p.blocs.map(b => { const row = d.rows.find(r => r.id === b.id); return <td key={b.id} className="text-center px-3 tabular">{display(row)}</td>; })}</tr>)}</tbody>
  </table> : <table className="w-full text-sm">
    <caption className="sr-only">השוואת מנדטים לפי הגושים שלי</caption>
    <thead><tr className="border-b border-paper-line"><th scope="col" className="text-start min-w-[5.5rem]">גוש</th>{series.map((d,i) => <th key={i} scope="col" className="px-1.5 min-w-[4.5rem] py-2">{labelOf(d)}</th>)}{compare && series.length === 2 && <th scope="col" className="px-1.5">{pct ? "שינוי באחוזים" : "שינוי במנדטים"}</th>}</tr></thead>
    <tbody>{p.blocs.map(b => { const first = blocComparable(series[0]?.rows.find(r => r.id === b.id)); const last = blocComparable(series[1]?.rows.find(r => r.id === b.id)); const delta = first !== null && last !== null ? last - first : null; return <BlocTableRow key={b.id} id={b.id} lists={b.lists} name={b.name} nameClass="text-start py-2 break-words" cellClass="px-1.5 text-center tabular" extra={compare && series.length === 2 ? <td className="text-center tabular"><bdi>{delta === null ? "—" : pct ? diffText(delta) : `${delta > 0 ? "+" : ""}${seatsFmt(delta)}`}</bdi></td> : null}>{series.map((d) => { const row = d.rows.find(r => r.id === b.id); return display(row); })}</BlocTableRow>; })}</tbody>
  </table>;
  return <BlocsDrawer title={title} returnTo={pathname + search}>
    <div data-personal-blocs-card className="space-y-2">
    <Explained showMeta={false} kind="השוואה" source={source} asOf={asOf} assumption="סכום הגוש הוא סכום המנדטים של המפלגות שיש עליהן נתון במקור; מפלגה שאין עליה נתון נספרת 0. גושים יכולים לחפוף ואין לחברם. אין חיבור טווחי מפלגות." methodAnchor="personal-blocs" trailing={<>
      {compare && <p>{pct ? "השינוי באחוזים" : "השינוי במנדטים"} מחושב מהסכום בכל מקור.</p>}
      {editTargets ? <p>״השלם הכול״ מתאים את המספר בכל מפלגה לצפי שלכם לגוש. הגושים הם תרחישים נפרדים, ומפלגה יכולה להופיע בכמה גושים.</p> : <p>תרחישים עצמאיים וחופפים; אין לחבר את סכומיהם. {unit.status !== "saved" ? "הרכב הגושים הוא טיוטה בדפדפן הזה." : "לפי הרכב הגושים השמור שלכם."}</p>}
    </>}>
      {!anyKnown ? <p className="text-sm text-ink-soft">אין נתון תואם למפלגות הגושים במקור הזה. לא ניתן להציג סכום.{series.length === 0 && " נסו להרחיב את המסננים."}</p> : series.length === 1 && one ? <><ul className="space-y-2">{one.rows.map(row => <BlocCardRow key={row.id} id={row.id} lists={p.blocs.find(b => b.id === row.id)?.lists ?? []} name={row.name} aside={<div className="flex items-center justify-end gap-x-3"><span className="font-num tabular font-bold whitespace-nowrap">{display(row)} מנדטים</span>{editTargets && <label className="font-sans text-xs font-normal flex items-center gap-1.5 whitespace-nowrap">הצפי שלי<input aria-label={`מנדטים צפויים לגוש ${row.name}`} type="number" min={0} max={120} inputMode="numeric" value={row.target ?? ""} className="w-16 min-h-[44px] rounded-theme border border-paper-line bg-paper text-ink px-2 font-num text-lg" onChange={e => unit.setDraft({ mode: "custom", schemaVersion: 2, blocs: p.blocs.map(b => b.id === row.id ? { ...b, target: e.target.value === "" ? null : Math.max(0, Math.min(120, Math.round(Number(e.target.value) || 0))) } : b) })} /></label>}</div>} />)}</ul></> : series.length > 0 ? <><><div className="overflow-x-auto">{table}</div></></> : <p>אין נתונים להצגה לפי המסננים שנבחרו.</p>}
    </Explained>
    </div>
  </BlocsDrawer>;
}

/** מתחת לנתון חסר רק "5/6": כמה מהמפלגות בגוש היו בסקר (הכרעת בעלים 11.10.2026); שמות המפלגות ומקורות האומדן — בריחוף ולקורא מסך */
/** שורת גוש בכרטיס צר: השם והמספרים באותה שורה (בלי פירוט מפלגות) */
function BlocCardRow({ id, lists, name, aside }: { id: string; lists: string[]; name: string; aside: ReactNode }) {
  return <li className="border-b border-paper-line pb-2 text-sm">
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0"><span className="break-words font-bold">{name}</span><BlocAvatar id={id} lists={lists} /></span>
      <div className="shrink-0">{aside}</div>
    </div>
  </li>;
}

/** שורת גוש בטבלה */
function BlocTableRow({ id, lists, name, nameClass, cellClass, extra = null, children }: { id: string; lists: string[]; name: string; nameClass: string; cellClass: string; extra?: ReactNode; children: ReactNode[] }) {
  return <tr className="border-b border-paper-line">
    <th scope="row" className={nameClass}><span className="font-bold break-words">{name}</span><BlocAvatar id={id} lists={lists} /></th>
    {children.map((c, i) => <td key={i} className={cellClass}>{c}</td>)}{extra}
  </tr>;
}
