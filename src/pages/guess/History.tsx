import PersonalBlocs from "../../components/PersonalBlocs";
import { useEffect, useState } from "react";
import { call, type BlocsPayload, type VotePayload, type SeatsPayload, type Unit, type Version } from "../../lib/crowdApi";
import { date } from "../../lib/format";
import { IDS, nameOf, k25VoteName, V2022_LABEL, V2026_LABEL } from "./model";
import { Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

const UNITS: { id: Unit; label: string }[] = [
  { id: "seats", label: "מנדטים" },
  { id: "blocs", label: "גושים" },
  { id: "vote", label: "הצבעה" },
];
const time = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

/** ציר הזמן של הגרסאות, והשוואה בין שתיים (מנדטים) */
export default function History({ session }: { session: ReturnType<typeof useSession> }) {
  const [unit, setUnit] = useState<Unit>("seats");
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<number[]>([]);
  useEffect(() => {
    if (!session.online || !session.token) return;
    let active = true;
    setErr(null);
    setVersions(null);
    setPick([]);
    call<{ versions: Version[] }>(`/history?unit=${unit}`, { token: session.token })
      .then((r) => { if (active) setVersions(r.versions); })
      .catch((e) => { if (active) setErr(errorText(e)); });
    return () => { active = false; };
  }, [unit, session.online, session.token]);

  if (!session.online) return <Notice>ההיסטוריה תופיע כשהשמירה תיפתח באתר: כל שמירה תהיה נקודה על ציר הזמן, ואפשר יהיה להשוות בין שתיים.</Notice>;
  if (!session.token) return <Notice>עוד לא שמרתם. אחרי השמירה הראשונה, כל גרסה תופיע כאן.</Notice>;

  const toggle = (id: number) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const [a, b] = pick.map((id) => versions?.find((v) => v.id === id)).filter(Boolean).sort((x,y) => x!.id - y!.id) as Version<SeatsPayload>[];
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="יחידה">
        {UNITS.map((u) => (
          <button key={u.id} type="button" role="radio" aria-checked={unit === u.id} onClick={() => setUnit(u.id)} className={`min-h-[44px] px-4 rounded-full border-2 text-sm font-bold ${unit === u.id ? "bg-ink text-paper-card border-ink" : "bg-paper-card border-paper-line"}`}>
            {u.label}
          </button>
        ))}
      </div>
      {err && <Notice tone="warn">{err}</Notice>}
      {versions === null && !err && <p className="text-ink-soft text-sm">טוען…</p>}
      {versions?.length === 0 && <Notice>אין עדיין גרסאות ביחידה הזו.</Notice>}
      {versions && versions.length > 0 && (
        <ol className="relative border-s-2 border-ink ms-2 space-y-3" aria-label="הגרסאות שלכם, מהחדשה לישנה">
          {[...versions].reverse().map((v, i) => (
            <li key={v.id} className="ps-4 relative">
              <span aria-hidden="true" className={`absolute -start-[9px] top-2 w-4 h-4 rounded-full border-2 border-ink ${i === 0 ? "bg-ink" : "bg-paper-card"}`} />
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                {unit === "seats" && <input type="checkbox" className="w-5 h-5" checked={pick.includes(v.id)} onChange={() => toggle(v.id)} aria-label={`להשוואה: גרסה מ-${date(v.created_at)}`} />}
                <span className="font-bold tabular">{date(v.created_at)}</span>
                <span className="text-ink-soft tabular">{time(v.created_at)}</span>
                {i === 0 && <span className="text-xs border border-ink rounded-full px-2">האחרונה — נספרת</span>}
              </label>
              <details className="bg-paper-card border border-paper-line rounded-theme p-3">
                <summary className="cursor-pointer min-h-[44px] font-bold flex items-center">תוכן גרסה {v.id}</summary>
                <VersionContent version={v} />
                {v.unit === "seats" && <PersonalBlocs values={Object.fromEntries(Object.entries((v.payload as SeatsPayload).seats).map(([id, c]) => [id, c.v]))} source={`מנדטי גרסה ${v.id}, לפי הרכב הגושים הנוכחי שלכם`} asOf={v.created_at} />}
              </details>
            </li>
          ))}
        </ol>
      )}
      {unit === "seats" && versions && versions.length > 1 && !b && <p className="text-xs text-ink-soft">סמנו שתי גרסאות כדי לראות מה השתנה.</p>}
      {a && b && <><PersonalBlocs values={Object.fromEntries(Object.entries(a.payload.seats).map(([id, c]) => [id, c.v]))} source={`גרסה קודמת ${a.id}, לפי הרכב הגושים הנוכחי`} asOf={a.created_at} /><PersonalBlocs values={Object.fromEntries(Object.entries(b.payload.seats).map(([id, c]) => [id, c.v]))} source={`גרסה מאוחרת ${b.id}, לפי הרכב הגושים הנוכחי`} asOf={b.created_at} /></>}
      {a && b && (
        <table className="w-full text-sm tabular">
          <caption className="text-start font-bold mb-1">
            קודם: גרסה {a.id}, {date(a.created_at)} {time(a.created_at)} · אחר כך: גרסה {b.id}, {date(b.created_at)} {time(b.created_at)}
          </caption>
          <thead>
            <tr className="text-ink-soft">
              <th className="text-start font-normal">רשימה</th>
              <th className="font-normal">{date(a.created_at)}</th>
              <th className="font-normal">{date(b.created_at)}</th>
              <th className="font-normal">שינוי</th>
            </tr>
          </thead>
          <tbody>
            {IDS.map((id) => {
              const x = a.payload.seats[id]?.v ?? 0;
              const y = b.payload.seats[id]?.v ?? 0;
              return (
                <tr key={id} className={`border-t border-paper-line ${x !== y ? "font-bold" : ""}`}>
                  <td className="py-1">{nameOf(id)}</td>
                  <td className="text-center">{x}</td>
                  <td className="text-center">{y}</td>
                  <td className="text-center">
                    <bdi dir="ltr">{y - x === 0 ? "0" : `${y - x > 0 ? "+" : "−"}${Math.abs(y - x)}`}</bdi>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function VersionContent({ version }: { version: Version }) {
  if (version.unit === "seats") {
    const p = version.payload as SeatsPayload;
    const ids = [...new Set([...IDS, ...Object.keys(p.seats)])];
    return <table className="w-full text-sm tabular"><thead><tr><th className="text-start">רשימה</th><th>מנדטים</th>{p.mode === "pct" && <th>אחוז שנשמר</th>}</tr></thead><tbody>{ids.map(id => <tr key={id} className="border-t border-paper-line"><td className="py-1">{nameOf(id)}</td><td className="text-center">{p.seats[id]?.v ?? "—"}</td>{p.mode === "pct" && <td className="text-center">{p.pct?.[id] === undefined ? "—" : `${p.pct[id]}%`}</td>}</tr>)}</tbody></table>;
  }
  if (version.unit === "blocs") {
    const p = version.payload as BlocsPayload;
    return <ul className="space-y-3">{p.blocs.map(b => <li key={b.id}><b>{b.name || "גוש ללא שם"}</b><p className="text-sm">{b.lists.map(nameOf).join(", ") || "ללא מפלגות"}</p><p className="text-sm">הימור ישיר: {b.target === null ? "ללא ניחוש" : `${b.target} מנדטים`}</p></li>)}</ul>;
  }
  const p = version.payload as VotePayload;
  return <dl className="text-sm space-y-2"><div><dt className="font-bold">הצבעה ב-2022</dt><dd>{p.v2022 === null ? "לא נמסרה תשובה" : V2022_LABEL[p.v2022] ?? k25VoteName(p.v2022)}</dd></div><div><dt className="font-bold">כוונה ל-2026</dt><dd>{p.v2026 === null ? "לא נמסרה תשובה" : V2026_LABEL[p.v2026] ?? nameOf(p.v2026)}</dd></div></dl>;
}
