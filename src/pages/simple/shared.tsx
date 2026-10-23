import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui";
import { PartyAvatar } from "../../components/PartyAvatar";
import Explained from "../../components/Explained";
import { DEFAULT_BLOCS, nameOf } from "../guess/model";
import { DATA_AS_OF } from "../../lib/dataResolver";
import { SIMPLE_FIRMS, simpleSelection } from "../../lib/simpleSources";
import { date, seatsFmt } from "../../lib/format";

const SOURCE_KEY = "elections26.simple-source";
let current = (() => { try { return localStorage.getItem(SOURCE_KEY) ?? "all"; } catch { return "all"; } })();
const listeners = new Set<(key: string) => void>();
export function useSimpleSource() {
  const [key, setKey] = useState(current);
  useEffect(() => { listeners.add(setKey); return () => { listeners.delete(setKey); }; }, []);
  return { key, selection: simpleSelection(key), setKey: (next: string) => {
    current = next;
    try { localStorage.setItem(SOURCE_KEY, next); } catch { /* מקומי לביקור */ }
    listeners.forEach(fn => fn(next));
  } };
}
export function SimpleSourcePicker({ source }: { source: ReturnType<typeof useSimpleSource> }) {
  return <label className="flex flex-wrap items-center gap-2 mb-5 text-sm"><span className="font-bold">מקור הסקרים</span><select className="min-h-[44px] max-w-full rounded-theme border border-paper-line bg-paper-card text-ink px-3" value={source.key} onChange={e => source.setKey(e.target.value)}>
    <option value="all">ממוצע כל הסקרים</option><option value="14-24">ממוצע 14 ו־i24</option>
    <optgroup label="לפי מכון">{SIMPLE_FIRMS.map(f => <option key={f.id} value={`firm:${f.id}`}>{f.name}</option>)}</optgroup>
  </select></label>;
}
export const number = (n: number | null | undefined) => n == null ? "—" : seatsFmt(n);
export function PartyName({ id }: { id: string }) {
  return <span className="flex items-center gap-1 sm:gap-2"><span className="hidden min-[360px]:contents"><PartyAvatar id={id} size={28} /></span><span>{nameOf(id)}</span></span>;
}
export function SimpleTable({ label, headers, rows, editor = false }: { label: string; headers: ReactNode[]; rows: { id: string; label: ReactNode; cells: ReactNode[] }[]; editor?: boolean }) {
  return <table className={`simple-table w-full table-fixed text-sm tabular ${editor ? "simple-editor" : ""}`}>
    <caption className="sr-only">{label}</caption>
    <colgroup><col style={{ width: editor ? "31%" : headers.length === 3 ? "34%" : "46%" }} />{headers.map((_, i) => <col key={i} style={{ width: editor ? (i === 2 ? "31%" : "19%") : `${(headers.length === 3 ? 66 : 54) / headers.length}%` }} />)}</colgroup>
    <thead><tr><th scope="col" className="text-start font-normal py-3">{editor ? "מפלגה" : label === "חלוקה לגושים" ? "גוש" : "מפלגה"}</th>{headers.map((h, i) => <th scope="col" key={i} className="text-center font-normal text-ink-soft px-1 py-3">{h}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.id} className="border-t border-paper-line"><th scope="row" className="text-start font-normal py-3 pe-1">{r.label}</th>{r.cells.map((c, i) => <td key={i} className="text-center border-s border-paper-line px-1 py-2">{c}</td>)}</tr>)}</tbody>
  </table>;
}
export function SimpleBlocs({ of }: { of: (ids: string[]) => number | null }) {
  return <Card title="החלוקה לגושים"><div className="flex flex-wrap gap-x-5 gap-y-3">{DEFAULT_BLOCS.blocs.map(b => <div key={b.id} className="flex items-baseline gap-2"><span className="text-sm text-ink-soft">{b.name}</span><strong className="text-xl tabular">{number(of(b.lists))}</strong></div>)}</div></Card>;
}
export function PollExplanation({ children }: { children: ReactNode }) {
  return <Explained kind="סיכום סקרים" source="הסקרים האחרונים בכל סדרת מכון ומזמין" asOf={date(DATA_AS_OF)} assumption="משקל שווה לסדרה בחלון הסקרים, ללא התאמה ל־120; 14 ו־i24 מסוננים לפי מזמין" methodAnchor="current">{children}</Explained>;
}
export function SimpleFooter() {
  return <nav aria-label="קישורים נוספים" className="mt-8 pt-4 border-t border-paper-line flex flex-wrap gap-5 text-sm"><Link to="/support">חשבון ותמיכה</Link><Link to="/method">מידע ומקורות</Link></nav>;
}
