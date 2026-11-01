import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import { listSurveys, type Survey } from "../../lib/surveys";

type Filter = "open" | "closed" | "all";
const FILTERS: [Filter, string][] = [["open", "פתוחים"], ["closed", "נסגרו"], ["all", "כולם"]];

/** מסך "כל הסקרים" (הכרעת בעלים 01.11.2026): הסקר הראשון מודגש, השאר ברשימה; סימון "ענית ✓" למחובר */
export default function SurveysScreen() {
  const session = useSession();
  const { token } = session;
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  useEffect(() => { listSurveys(token).then((r) => { setSurveys(r.surveys); setFailed(false); }).catch(() => setFailed(true)); }, [token]);

  const shown = (surveys ?? []).filter((s) => filter === "all" || (filter === "open" ? s.status !== "closed" : s.status === "closed"));
  const [lead, ...rest] = shown;
  return (
    <main className="px-4 md:px-6 pb-28 space-y-3.5 md:max-w-3xl md:mx-auto">
      <h1 className="text-[28px] font-display leading-tight pt-1">כל הסקרים</h1>
      <div className="f-seg fit" role="radiogroup" aria-label="סינון">
        {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {failed && <p className="text-ink-soft">רשימת הסקרים אינה זמינה כרגע.</p>}
      {!failed && !surveys && <p className="text-ink-soft">טוען…</p>}
      {surveys && !shown.length && <p className="text-ink-soft">אין סקרים כאן כרגע.</p>}
      {surveys && !token && (
        <section className="f-card space-y-2">
          <p className="text-sm">חברי הגזרה רואים את כל סקרי הגזרה אחרי כניסה עם Google.</p>
          <GoogleButton session={session} onDone={() => void session.refresh()} />
        </section>
      )}
      {lead && (
        <Link to={`/s/${lead.id}`} className="block f-card !border-[1.5px] !border-signal no-underline text-ink">
          <div className="flex items-center gap-2 mb-1.5 text-xs">
            {lead.status === "draft" ? <span className="font-bold px-2 py-0.5 rounded-full bg-[rgb(var(--grid))] text-ink-soft">טיוטה</span> : lead.status === "closed" ? <span className="font-bold px-2 py-0.5 rounded-full bg-[rgb(var(--grid))] text-ink-soft">נסגר</span> : <span className="font-bold px-2 py-0.5 rounded-full bg-signal text-signal-ink">פתוח</span>}
            <span className="text-ink-soft">{lead.questions.length} שאלות</span>
          </div>
          <div className="text-[22px] font-display mb-2">{lead.title}</div>
          <ul className="text-sm text-ink-soft list-disc pr-5 mb-3 space-y-0.5">{lead.questions.map((q) => <li key={q.id}>{q.title}</li>)}</ul>
          <span className="f-btn pri">{lead.answered ? "לעדכן תשובות" : lead.status === "open" && lead.canAnswer ? "להשתתף" : "לצפייה"}</span>
          {lead.answered && <span className="text-sm text-ink-soft ms-3">ענית ✓</span>}
        </Link>
      )}
      {rest.length > 0 && (
        <ul className="f-card !p-0 divide-y divide-paper-line">
          {rest.map((s) => (
            <li key={s.id}>
              <Link to={`/s/${s.id}`} className="flex items-center gap-3 px-4 py-3.5 no-underline text-ink">
                <span className="flex-1 min-w-0"><span className="block font-bold">{s.title}</span><span className="block text-[12.5px] text-ink-soft">{s.questions.length} שאלות · {s.status === "open" ? "פתוח" : s.status === "closed" ? "נסגר" : "טיוטה"}</span></span>
                {s.answered && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent-soft text-signal">ענית ✓</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
