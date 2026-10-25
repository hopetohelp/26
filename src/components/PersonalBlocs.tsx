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
import { KNESSET_GROUPS } from "../lib/simpleSources";
import { DoublePie } from "../pages/simple/shared";
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
  const { pathname, search } = useLocation();
  // במקום הגושים האישיים הישנים — חמש הקבוצות הקבועות (הכרעת בעלים 25.10.2026). יעדי גושים ישנים אינם מוצגים.
  void editTargets;
  const p = { blocs: KNESSET_GROUPS };
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
  // מקור אחד במנדטים לפי רשימות היום ⇐ העוגה הכפולה; כמה מקורות, אחוזים או תוצאות עבר ⇐ רשימה
  const single = datasets ? datasets[0] : { values, historical, mapping };
  const pieValues = series.length === 1 && !pct && single && !single.historical && !single.mapping && !("families" in single && single.families) && !("selection" in single && single.selection) && !("poll" in single && single.poll) && !("rows" in single && single.rows) ? (single.values ?? {}) : null;
  /** בלי תאריך בכרטיס (הכרעת בעלים 11.10.2026); רק כששני מקורות נושאים אותו שם התאריך הוא מה שמבדיל ביניהם */
  const labelOf = (d: (typeof series)[number]) => series.filter(x => x.source === d.source).length > 1 ? `${d.source} · ${displayDate(d.asOf)}` : d.source;
  const stacked = <table className="w-full table-fixed text-xs">
    <caption className="sr-only">חלוקת הכנסת מול המשתתפים והסקרים</caption>
    <thead><tr className="border-b border-paper-line"><th className="text-start w-[36%] py-1">גוש</th>{series.map((d,i) => <th key={i} className="px-1 font-normal border-s border-paper-line" title={labelOf(d)}>{d.source.includes("המשתתפים") ? "משתתפים" : d.source === "הניחוש שלי" ? "שלי" : labelOf(d)}</th>)}</tr></thead>
    <tbody>{p.blocs.map(b => <BlocTableRow key={b.id} id={b.id} lists={b.lists} name={b.name} nameClass="text-start py-1.5 pe-1 font-normal break-words" cellClass="text-center px-1 tabular font-bold">{series.map((d) => { const row = d.rows.find(r => r.id === b.id); return display(row); })}</BlocTableRow>)}</tbody>
  </table>;
  const table = compact ? stacked : <table className="w-full text-sm">
    <caption className="sr-only">השוואת מנדטים לפי חלוקת הכנסת</caption>
    <thead><tr className="border-b border-paper-line"><th scope="col" className="text-start min-w-[5.5rem]">גוש</th>{series.map((d,i) => <th key={i} scope="col" className="px-1.5 min-w-[4.5rem] py-2 border-s border-paper-line">{labelOf(d)}</th>)}{compare && series.length === 2 && <th scope="col" className="px-1.5 border-s border-paper-line">{pct ? "שינוי באחוזים" : "שינוי במנדטים"}</th>}</tr></thead>
    <tbody>{p.blocs.map(b => { const first = blocComparable(series[0]?.rows.find(r => r.id === b.id)); const last = blocComparable(series[1]?.rows.find(r => r.id === b.id)); const delta = first !== null && last !== null ? last - first : null; return <BlocTableRow key={b.id} id={b.id} lists={b.lists} name={b.name} nameClass="text-start py-2 break-words" cellClass="px-1.5 text-center tabular" extra={compare && series.length === 2 ? <td className="text-center tabular border-s border-paper-line"><bdi>{delta === null ? "—" : pct ? diffText(delta) : `${delta > 0 ? "+" : ""}${seatsFmt(delta)}`}</bdi></td> : null}>{series.map((d) => { const row = d.rows.find(r => r.id === b.id); return display(row); })}</BlocTableRow>; })}</tbody>
  </table>;
  const singleTable = <div className="[container-type:inline-size]">
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">מנדטים לפי חלוקת הכנסת</caption>
      <thead><tr className="border-b-2 border-ink/30">
        <th scope="col" className="text-start py-2">גוש</th>
        <th scope="col" className="w-16 sm:w-20 px-1 border-s border-paper-line">{pct ? "אחוזים" : "מנדטים"}</th>
      </tr></thead>
      <tbody>{one?.rows.map(row => <tr key={row.id} className="border-b border-paper-line">
        <th scope="row" className="py-2 pe-2 text-start">
          <BlocName id={row.id} lists={p.blocs.find(b => b.id === row.id)?.lists ?? []} name={row.name} />
        </th>
        <td className="text-center font-num tabular font-bold px-1 border-s border-paper-line">{display(row)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
  return <BlocsDrawer title={title} returnTo={pathname + search}>
    <div data-personal-blocs-card className="space-y-2">
    <Explained bare showMeta={false} kind="השוואה" source={source} asOf={asOf} assumption="סכום הגוש הוא סכום המנדטים של המפלגות שיש עליהן נתון במקור; מפלגה שאין עליה נתון נספרת 0. האחדות חופפת לנתניהו ולאייזנקוט ואין לחבר אותה אליהם. אין חיבור טווחי מפלגות." methodAnchor="personal-blocs">
      {!anyKnown ? <p className="text-sm text-ink-soft">אין נתון תואם למפלגות הגושים במקור הזה. לא ניתן להציג סכום.{series.length === 0 && " נסו להרחיב את המסננים."}</p> : series.length === 1 && one && pieValues ? <DoublePie values={pieValues} /> : series.length === 1 && one ? singleTable : series.length > 0 ? <><><div className="overflow-x-auto">{table}</div></></> : <p>אין נתונים להצגה לפי המסננים שנבחרו.</p>}
    </Explained>
    </div>
  </BlocsDrawer>;
}

/** שם ותמונות בשורה אחת; התמונות מופיעות רק כשהתא רחב מספיק. */
function BlocName({ id, lists, name }: { id: string; lists: string[]; name: string }) {
  return <span className="block [container-type:inline-size]">
    <span className="flex items-center gap-2 min-w-0">
      <span className="font-bold truncate shrink-0 max-w-full" title={name}>{name}</span>
      <span className="hidden min-w-0 flex-1 [@container(min-width:12rem)]:block"><BlocAvatar id={id} lists={lists} size={20} /></span>
    </span>
  </span>;
}

/** שורת גוש בטבלה */
function BlocTableRow({ id, lists, name, nameClass, cellClass, extra = null, children }: { id: string; lists: string[]; name: string; nameClass: string; cellClass: string; extra?: ReactNode; children: ReactNode[] }) {
  return <tr className="border-b border-paper-line">
    <th scope="row" className={nameClass}><BlocName id={id} lists={lists} name={name} /></th>
    {children.map((c, i) => <td key={i} className={`${cellClass} border-s border-paper-line`}>{c}</td>)}{extra}
  </tr>;
}
