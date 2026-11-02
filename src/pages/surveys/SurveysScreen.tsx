import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import { closesLabel, getSurvey, kindLabel, listSurveys, type Survey, type SurveyDetail } from "../../lib/surveys";
import { isEmbed } from "../../lib/embed";

/** גרף תשובות קטן על הכרטיס, לסקר שהמשתתף כבר ענה עליו (הכרעת בעלים 01.11.2026): שאלות הבחירה, לפי הגזרה */
function MiniResults({ detail }: { detail: SurveyDetail }) {
  const r = detail.results?.group;
  if (!r) return null;
  // מבחוץ לא מציגים "ממתין ל־50 משתתפים" (הכרעת בעלים 02.11.2026)
  if ("hidden" in r) return null;
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
/** מתג סינון לצופים (הכרעת בעלים 01.11.2026): סקרים / ניחושים */
type KindFilter = "all" | "survey" | "guess";
const KIND_FILTERS: [KindFilter, string][] = [["all", "הכול"], ["survey", "סקרים"], ["guess", "ניחושים"]];
/** תגית מצב / מועד סגירה על הכרטיס */
const statusText = (s: Survey) => (s.status === "draft" ? "טיוטה" : s.status === "closed" ? "נסגר" : closesLabel(s) ? `פתוח עד ${closesLabel(s)}` : "פתוח");

/** מסך "כל הסקרים": כל הסקרים והניחושים באותה תצוגה (הכרעת בעלים 02.11.2026); סימון "ענית ✓" למחובר. הכניסה לכל סקר — רק מכאן */
export default function SurveysScreen() {
  const session = useSession();
  const { token } = session;
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
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
  const guesses = filter !== "open" && kindFilter !== "survey";
  const shown = (surveys ?? []).filter((s) => (filter === "all" || (filter === "open" ? s.status !== "closed" : s.status === "closed")) && (kindFilter === "all" || s.kind === kindFilter));
  return (
    <main className="px-4 md:px-6 pb-28 space-y-3.5 md:max-w-3xl md:mx-auto">
      <h1 className="text-[28px] font-display leading-tight pt-1">כל הסקרים</h1>
      <div className="flex flex-wrap gap-2">
        <div className="f-seg fit !mb-0" role="radiogroup" aria-label="סינון">
          {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <div className="f-seg fit !mb-0" role="radiogroup" aria-label="סוג">
          {KIND_FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)}>{l}</button>)}
        </div>
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
      {(shown.length > 0 || guesses) && (
        <ul className="f-card !p-0 divide-y divide-paper-line">
          {shown.map((s) => (
            <li key={s.id}>
              <Link to={to(s.id)} className="block px-4 py-3.5 no-underline text-ink">
                <span className="flex items-center gap-3">
                  <span className="flex-1 min-w-0"><span className="block font-bold">{s.title}</span><span className="block text-[12.5px] text-ink-soft">{kindLabel(s.kind)} · {statusText(s)}</span></span>
                  {s.answered && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent-soft text-signal">ענית ✓</span>}
                </span>
                {details[s.id] && <MiniResults detail={details[s.id]} />}
              </Link>
            </li>
          ))}
          {guesses && (
            <li>
              <Link to="/surveys/guesses" className="block px-4 py-3.5 no-underline text-ink">
                <span className="flex items-center gap-3">
                  <span className="flex-1 min-w-0"><span className="block font-bold">הניחושים — 120 המנדטים</span><span className="block text-[12.5px] text-ink-soft">ניחוש · נסגר עם סגירת הקלפיות, 27.10 בשעה 21:58</span></span>
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
