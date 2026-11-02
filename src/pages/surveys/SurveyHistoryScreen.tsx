import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import { answerTime, columnSeats, surveyHistory, type AssignValue, type SurveyHistory, type SurveyQuestion } from "../../lib/surveys";

/** אזור אישי בחלק הסקרים (הכרעת בעלים 01.11.2026): היסטוריה מלאה לפי שאלה — כל תשובה ושינוי, מהחדש לישן */
/** embedded — בתוך מגירה באזור האישי: בלי מסגרת עמוד וכותרת */
export default function SurveyHistoryScreen({ embedded = false }: { embedded?: boolean }) {
  const session = useSession();
  const { token } = session;
  const [data, setData] = useState<SurveyHistory | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (token) surveyHistory(token).then(setData).catch(() => setFailed(true)); }, [token]);

  if (!token) return (
    <main className="px-4 md:px-6 pb-28 space-y-3 md:max-w-3xl md:mx-auto">
      <h1 className="text-[26px] font-display pt-1">היסטוריית הסקרים שלי</h1>
      <p>כדי לראות את ההיסטוריה — כניסה עם Google.</p>
      <GoogleButton session={session} onDone={() => void session.refresh()} />
    </main>
  );
  const Wrap = embedded ? "div" : "main";
  return (
    <Wrap className={embedded ? "space-y-3.5" : "px-4 md:px-6 pb-28 space-y-3.5 md:max-w-3xl md:mx-auto"}>
      {!embedded && <h1 className="text-[26px] font-display pt-1">היסטוריית הסקרים שלי</h1>}
      {failed && <p className="text-ink-soft">ההיסטוריה אינה זמינה כרגע.</p>}
      {!failed && !data && <p className="text-ink-soft">טוען…</p>}
      {data && !data.answers.length && <div className="space-y-2"><p className="text-ink-soft">עוד לא ענית על סקר.</p><Link to="/surveys" className="f-btn">לכל הסקרים</Link></div>}
      {data?.surveys.map((s) => s.questions.map((q) => {
        // ציר הזמן של השאלה: רק השמירות שבהן נענתה, ורק כשהתשובה השתנתה מהשמירה הקודמת
        const rows = data.answers.filter((a) => a.survey === s.id && a.answers[q.id] !== undefined).reverse()
          .filter((a, i, all) => i === 0 || JSON.stringify(a.answers[q.id]) !== JSON.stringify(all[i - 1].answers[q.id])).reverse();
        if (!rows.length) return null;
        return (
          <section key={`${s.id}-${q.id}`} className="f-card">
            <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] text-ink-soft">{s.title}</span><Link to={`/s/${s.id}`} className="f-btn !min-h-[32px] !text-xs">לסקר</Link></div>
            <h2 className="text-base font-bold mt-0.5 mb-2.5">{q.title}</h2>
            <ol className="list-none m-0 p-0 border-r-2 border-paper-line mr-1.5">
              {rows.map((a, i) => {
                const { main, detail } = describe(q, a.answers[q.id]);
                return (
                  <li key={a.at} className={`relative pr-4 pb-2.5 ${i ? "text-ink-soft" : ""}`}>
                    <i className={`absolute -right-[7px] top-1 w-3 h-3 rounded-full ${i ? "bg-paper-line" : "bg-signal"}`} aria-hidden="true" />
                    <b className={i ? "font-normal" : ""}>{main}</b> <span className="text-xs text-ink-soft">· {answerTime(a.at)}{i === 0 ? " · נוכחי" : ""}</span>
                    {detail && <span className="block text-[12.5px] text-ink-soft">{detail}</span>}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      }))}
    </Wrap>
  );
}

/** התשובה במילים: בחירה ⇐ שם האפשרות; שיוך ⇐ מנדטי העמודה הראשונה ושמות הרשימות בה */
function describe(q: SurveyQuestion, v: unknown): { main: string; detail?: string } {
  if (q.kind === "single") return { main: q.options.find((o) => o.id === v)?.label ?? "—" };
  if (q.kind === "range") return { main: String(v) };
  const ans = v as Record<string, AssignValue>;
  const first = q.columns[0];
  const seats = columnSeats(q, ans)[first.id] ?? 0;
  const names = q.items.filter((i) => { const x = ans[i.id]; return typeof x === "string" ? x === first.id : !!x && (x[first.id] ?? 0) > 0; })
    .map((i) => typeof ans[i.id] === "object" ? `${i.label} (חלק)` : i.label);
  return { main: `${first.label}: ${seats} מנדטים`, detail: names.join(", ") || "לא סומנו רשימות" };
}
