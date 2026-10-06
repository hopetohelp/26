import { useEffect, useState } from "react";
import { call, type SeatsPayload, type Unit, type Version } from "../../lib/crowdApi";
import { date } from "../../lib/format";
import { IDS, nameOf } from "./model";
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
    setVersions(null);
    setPick([]);
    call<{ versions: Version[] }>(`/history?unit=${unit}`, { token: session.token })
      .then((r) => setVersions(r.versions))
      .catch((e) => setErr(errorText(e)));
  }, [unit, session.online, session.token]);

  if (!session.online) return <Notice>ההיסטוריה תופיע כשהשמירה תיפתח באתר: כל שמירה תהיה נקודה על ציר הזמן, ואפשר יהיה להשוות בין שתיים.</Notice>;
  if (!session.token) return <Notice>עוד לא שמרתם. אחרי השמירה הראשונה, כל גרסה תופיע כאן.</Notice>;

  const toggle = (id: number) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const [a, b] = pick.map((id) => versions?.find((v) => v.id === id)).filter(Boolean) as Version<SeatsPayload>[];
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
            </li>
          ))}
        </ol>
      )}
      {unit === "seats" && versions && versions.length > 1 && !b && <p className="text-xs text-ink-soft">סמנו שתי גרסאות כדי לראות מה השתנה.</p>}
      {a && b && (
        <table className="w-full text-sm tabular">
          <caption className="text-start font-bold mb-1">
            {date(a.created_at)} מול {date(b.created_at)}
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
