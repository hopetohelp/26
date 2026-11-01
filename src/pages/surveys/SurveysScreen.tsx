import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import { getSurvey, listSurveys, type Survey, type SurveyDetail } from "../../lib/surveys";
import { isEmbed } from "../../lib/embed";

/** גרף תשובות קטן על הכרטיס, לסקר שהמשתתף כבר ענה עליו (הכרעת בעלים 01.11.2026): שאלות הבחירה, לפי הגזרה */
function MiniResults({ detail }: { detail: SurveyDetail }) {
  const r = detail.results?.group;
  if (!r) return null;
  if ("hidden" in r) return <p className="text-[12.5px] text-ink-soft mt-2">התוצאות יוצגו מ־{r.min} משתתפים (עד עכשיו <span className="font-num">{r.n}</span>).</p>;
  return (
    <div className="mt-2 space-y-1.5" aria-label="תוצאות הגזרה">
      {detail.survey.questions.map((q) => {
        const qr = r.questions[q.id];
        if (q.kind !== "single" || !qr || !("counts" in qr) || !qr.n) return null;
        return (
          <div key={q.id}>
            <div className="text-[12px] text-ink-soft">{q.title}</div>
            <div className="flex h-5 rounded-md overflow-hidden text-[11px] font-bold" role="img" aria-label={q.options.map((o) => `${o.label} ${Math.round((qr.counts[o.id] / qr.n) * 100)}%`).join(", ")}>
              {q.options.map((o, i) => {
                const pct = Math.round((qr.counts[o.id] / qr.n) * 100);
                return pct ? <span key={o.id} className={`${i % 2 ? "bg-[rgb(var(--bloc-5))] text-paper" : "bg-signal text-signal-ink"} flex items-center px-1.5 whitespace-nowrap overflow-hidden`} style={{ width: `${pct}%` }}>{o.label} {pct}%</span> : null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  // בתוך הטמעה: המעבר בין הסקרים נשאר בחלון המוטמע
  const embed = isEmbed();
  const to = (id: string) => `/s/${id}${embed ? "?embed=1" : ""}`;
  // תוצאות לכרטיסים של סקרים שכבר ענית עליהם (ולמנהלים)
  const [details, setDetails] = useState<Record<string, SurveyDetail>>({});
  useEffect(() => {
    for (const s of surveys ?? []) if (s.answered || s.manage) getSurvey(s.id, token).then((d) => setDetails((x) => ({ ...x, [s.id]: d })), () => {});
  }, [surveys, token]);

  // "הניחושים" — סקר שהסתיים (הכרעת בעלים 01.11.2026): הניחוש של 120 המנדטים, שנסגר עם סגירת הקלפיות
  const guesses = filter !== "open";
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
      {surveys && !shown.length && !guesses && <p className="text-ink-soft">אין סקרים כאן כרגע.</p>}
      {surveys && !token && (
        <section className="f-card space-y-2">
          <p className="text-sm">חברי הגזרה רואים את כל סקרי הגזרה אחרי כניסה עם Google.</p>
          <GoogleButton session={session} onDone={() => void session.refresh()} />
        </section>
      )}
      {lead && (
        <Link to={to(lead.id)} className="block f-card !border-[1.5px] !border-signal no-underline text-ink">
          <div className="flex items-center gap-2 mb-1.5 text-xs">
            {lead.status === "draft" ? <span className="font-bold px-2 py-0.5 rounded-full bg-[rgb(var(--grid))] text-ink-soft">טיוטה</span> : lead.status === "closed" ? <span className="font-bold px-2 py-0.5 rounded-full bg-[rgb(var(--grid))] text-ink-soft">נסגר</span> : <span className="font-bold px-2 py-0.5 rounded-full bg-signal text-signal-ink">פתוח</span>}
            <span className="text-ink-soft">{lead.questions.length} שאלות</span>
          </div>
          <div className="text-[22px] font-display mb-2">{lead.title}</div>
          <ul className="text-sm text-ink-soft list-disc pr-5 mb-3 space-y-0.5">{lead.questions.map((q) => <li key={q.id}>{q.title}</li>)}</ul>
          <span className="f-btn pri">{lead.answered ? "לעדכן תשובות" : lead.status === "open" && lead.canAnswer ? "להשתתף" : "לצפייה"}</span>
          {lead.answered && <span className="text-sm text-ink-soft ms-3">ענית ✓</span>}
          {details[lead.id] && <MiniResults detail={details[lead.id]} />}
        </Link>
      )}
      {guesses && (
        <Link to="/surveys/guesses" className="block f-card no-underline text-ink">
          <span className="flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="block font-bold">הניחושים — 120 המנדטים</span>
              <span className="block text-[12.5px] text-ink-soft">נסגר עם סגירת הקלפיות, 27.10 בשעה 21:58 · ממוצע הניחושים מול התוצאות</span>
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgb(var(--grid))] text-ink-soft">נסגר</span>
          </span>
        </Link>
      )}
      {rest.length > 0 && (
        <ul className="f-card !p-0 divide-y divide-paper-line">
          {rest.map((s) => (
            <li key={s.id}>
              <Link to={to(s.id)} className="block px-4 py-3.5 no-underline text-ink">
                <span className="flex items-center gap-3">
                  <span className="flex-1 min-w-0"><span className="block font-bold">{s.title}</span><span className="block text-[12.5px] text-ink-soft">{s.questions.length} שאלות · {s.status === "open" ? "פתוח" : s.status === "closed" ? "נסגר" : "טיוטה"}</span></span>
                  {s.answered && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent-soft text-signal">ענית ✓</span>}
                </span>
                {details[s.id] && <MiniResults detail={details[s.id]} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
