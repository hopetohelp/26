import { useEffect, useState } from "react";
import { Card } from "./ui";
import Explained from "./Explained";
import { localityCsv, queryLocalities, type LocalityElection } from "../lib/localities";
import { num, pct } from "../lib/format";

export default function LocalityResults({ electionId }: { electionId: string }) {
  const [data, setData] = useState<LocalityElection[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  useEffect(() => { let live = true; import('../data/localities.json').then(d => { if (live) setData(d.default.elections as LocalityElection[]); }).catch(() => { if (live) setError(true); }); return () => { live = false; }; }, []);
  const e = data?.find(e => e.id === electionId);
  if (!e) return <p role="status">{error ? 'טעינת תוצאות היישובים נכשלה. רעננו כדי לנסות שוב.' : 'טוען תוצאות לפי יישוב…'}</p>;
  const page = queryLocalities(e, query, offset);
  const download = () => { const url = URL.createObjectURL(new Blob([localityCsv(e)], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${electionId}-localities.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <Card title="כל הקולות לפי יישוב"><Explained kind="נתון רשמי" source="קובץ היישובים של ועדת הבחירות המרכזית" asOf={e.date} assumption="מעטפות חיצוניות מוצגות בנפרד. אחוז ההצבעה הוא מצביעים חלקי בעלי זכות הבחירה בקובץ היישובים." methodAnchor="results">
    <div className="flex flex-wrap gap-3 items-center my-3"><label>חיפוש יישוב או סמל <input className="bg-paper border border-paper-line rounded p-2 max-w-full" value={query} onChange={ev => { setQuery(ev.target.value); setOffset(0); }} /></label><button type="button" className="btn" onClick={download}>הורדת הטבלה המלאה</button><a href={e.source} target="_blank" rel="noreferrer">המקור הרשמי</a></div>
    <p className="text-sm text-ink-soft">מעטפות חיצוניות אינן משויכות לעיר. {e.eligibleInLocalityFile !== e.eligibleNational && 'סכום בעלי זכות הבחירה בקובץ היישובים שונה מהסיכום הארצי; מוצגים הערכים המקוריים של כל קובץ.'}</p>
    <div className="overflow-x-auto max-w-full" role="region" aria-label="תוצאות לפי יישוב — גלילה אופקית לכל הרשימות" tabIndex={0}><table className="w-full text-sm whitespace-nowrap"><caption className="sr-only">{e.label} — כל היישובים וכל הרשימות</caption><thead><tr>{['יישוב', 'סמל', 'בעלי זכות', 'מצביעים', 'אחוז הצבעה', 'כשרים', 'פסולים', ...e.lists.map(l => l.name)].map((h, i) => <th className="p-2 text-start border-b border-paper-line" scope="col" key={i}>{h}</th>)}</tr></thead><tbody>{page.rows.map(r => <tr key={r.code}><th className="p-2 text-start border-b border-paper-line" scope="row">{r.name}</th>{[r.code, num(r.eligible), num(r.voted), r.eligible && !r.external ? pct(r.voted / r.eligible * 100) : '—', num(r.valid), num(r.invalid), ...e.lists.map(l => num(r.votes[l.letters] ?? 0))].map((v, i) => <td className="p-2 tabular-nums border-b border-paper-line" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
    <div className="flex flex-wrap items-center gap-4 mt-3"><button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))}>הקודם</button><span role="status">{page.matched ? `${offset + 1}–${offset + page.rows.length} מתוך ${num(page.matched)}` : 'לא נמצאו יישובים'}</span><button type="button" disabled={page.nextOffset === null} onClick={() => setOffset(page.nextOffset!)}>הבא</button></div>
  </Explained></Card>;
}
