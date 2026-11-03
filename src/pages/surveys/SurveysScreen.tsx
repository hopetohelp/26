import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import { cached, closesLabel, ELECTION_RESULTS_TITLE, getSurvey, surveyPath, surveysPath, numbered, listSurveys, type Survey, type SurveyDetail } from "../../lib/surveys";
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
            {q.title && <div className="text-[12px] text-ink-soft">{q.title}</div>}
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

/**
 * מבנה הרשימה (הכרעת בעלים 03.11.2026): "להשתתף · לעדכן · סגור" (בלי חשבון: "להשתתף · סגור").
 * בפתוחים — שני חלקים, ניחושים וסקרים, בלי מתג. בנסגרו — הכול יחד, בלי מתג (הכרעת בעלים 03.11.2026);
 * בניחושים: קודם "ממתינים לתוצאה" (אין עדיין תוצאת אמת), אחר כך "יש תוצאה".
 */
type Tab = "todo" | "done" | "closed";
/** תגית מצב / מועד סגירה על הכרטיס */
const statusText = (s: Survey) => (s.status === "draft" ? "טיוטה" : s.status === "closed" ? (closesLabel(s) ? `נסגר ${closesLabel(s)}` : "נסגר") : closesLabel(s) ? `פתוח עד ${closesLabel(s)}` : "פתוח");
const newest = (a: Survey, b: Survey) => b.updatedAt.localeCompare(a.updatedAt);

/** מסך "כל הסקרים" — הכניסה לכל סקר וניחוש רק מכאן */
export default function SurveysScreen() {
  const session = useSession();
  const { token } = session;
  const [surveys, setSurveys] = useState<Survey[] | null>(() => cached<{ surveys: Survey[] }>(surveysPath, token)?.surveys ?? null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  useEffect(() => { listSurveys(token).then((r) => { setSurveys(r.surveys); setFailed(false); }).catch(() => setFailed(true)); }, [token]);
  // בתוך הטמעה: המעבר בין הסקרים נשאר בחלון המוטמע
  const embed = isEmbed();
  const to = (id: string) => `/s/${id}${embed ? "?embed=1" : ""}`;
  // תוצאות לכרטיסים של סקרים שכבר ענית עליהם (ולמנהלים)
  const [details, setDetails] = useState<Record<string, SurveyDetail>>(() => Object.fromEntries((cached<{ surveys: Survey[] }>(surveysPath, token)?.surveys ?? []).flatMap((s) => { const d = cached<SurveyDetail>(surveyPath(s.id), token); return d ? [[s.id, d]] : []; })));
  useEffect(() => {
    for (const s of surveys ?? []) if (s.answered || s.manage) getSurvey(s.id, token).then((d) => setDetails((x) => ({ ...x, [s.id]: d })), () => {});
  }, [surveys, token]);

  const all = surveys ?? [];
  const open = all.filter((s) => s.status !== "closed");
  const closed = all.filter((s) => s.status === "closed").sort(newest);
  const todo = token ? open.filter((s) => !s.answered) : open;
  const done = token ? open.filter((s) => s.answered) : [];
  const tabs: [Tab, string][] = token ? [["todo", "להשתתף"], ["done", "לעדכן"], ["closed", "סגור"]] : [["todo", "להשתתף"], ["closed", "סגור"]];
  // ברירת מחדל "להשתתף"; אם אין שם כלום — "השתתפתי"
  const current: Tab = tab ?? (todo.length || !done.length ? "todo" : "done");

  const row = (s: Survey) => (
    <li key={s.id} className="f-card !p-0">
      <Link to={to(s.id)} className="block px-4 py-3.5 no-underline text-ink">
        <span className="flex items-center gap-3">
          <span className="flex-1 min-w-0"><span className="block font-bold">{numbered(s)}</span><span className="block text-[12.5px] text-ink-soft">{statusText(s)}</span></span>
          {s.answered && current !== "done" && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent-soft text-signal">השתתפת ✓</span>}
          {current === "done" && <span className="f-btn sm">לעדכן</span>}
        </span>
        {details[s.id] && <MiniResults detail={details[s.id]} />}
      </Link>
    </li>
  );
  // "תוצאות הבחירות" — ניחוש 120 המנדטים, מספר 1 (הכרעות בעלים 01.11 ו-02.11.2026): נסגר ויש לו תוצאה
  const legacy = (
    <li key="guesses" className="f-card !p-0">
      <Link to="/surveys/guesses" className="block px-4 py-3.5 no-underline text-ink">
        <span className="block font-bold">{ELECTION_RESULTS_TITLE}</span>
        <span className="block text-[12.5px] text-ink-soft">נסגר עם סגירת הקלפיות, 27.10 בשעה 21:58</span>
      </Link>
    </li>
  );
  const section = (title: string, items: Survey[], extra?: JSX.Element) =>
    items.length || extra ? (
      <section key={title} className="space-y-2">
        <h2 className="text-base font-bold">{title}</h2>
        <ul className="space-y-2">{items.map(row)}{extra}</ul>
      </section>
    ) : null;

  let content: (JSX.Element | null)[];
  if (current === "closed") {
    const guesses = closed.filter((s) => s.kind === "guess");
    // בלי מתג ניחושים / סקרים (הכרעת בעלים 03.11.2026): כל מה שנסגר באותו מסך
    content = [section("ממתינים לתוצאה", guesses.filter((s) => !s.truth)), section("יש תוצאה", guesses.filter((s) => s.truth), legacy), section("סקרים", closed.filter((s) => s.kind === "survey"))];
  } else {
    const items = current === "todo" ? todo : done;
    content = [section("ניחושים", items.filter((s) => s.kind === "guess")), section("סקרים", items.filter((s) => s.kind === "survey"))];
  }
  const empty = surveys && !content.some(Boolean);
  return (
    <main className="px-4 md:px-6 pb-28 space-y-3.5 md:max-w-3xl md:mx-auto">
      <h1 className="sr-only">סקרים וניחושים</h1>
      {/* שני המתגים באותו גודל ובאותה שורה (הכרעת בעלים 02.11.2026) */}
      <div className="f-seg-pair">
      <div className="f-seg fit !mb-0" role="radiogroup" aria-label="סינון">
        {tabs.map(([k, l]) => <button key={k} type="button" aria-pressed={current === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      </div>
      {failed && <p className="text-ink-soft">רשימת הסקרים אינה זמינה כרגע.</p>}
      {!failed && !surveys && <p className="text-ink-soft">טוען…</p>}
      {empty && <p className="text-ink-soft">{current === "todo" && token ? "השתתפת בכל מה שפתוח כרגע." : "אין כאן כרגע."}</p>}
      {surveys && !token && (
        <section className="f-card space-y-2">
          <p className="text-sm">חברי הגזרה רואים את כל סקרי הגזרה אחרי כניסה עם Google.</p>
          <GoogleButton session={session} onDone={() => void session.refresh()} />
        </section>
      )}
      {content}
    </main>
  );
}
