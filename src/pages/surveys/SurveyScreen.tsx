import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import { answerSurvey, columnSeats, getSurvey, itemSeats, majorityLine, MAJORITY, type SurveyAnswers, type SurveyDetail, type SurveyQuestion, type SurveyResults } from "../../lib/surveys";

/** צבעי שלוש העמודות בשאלת שיוך — מהטוקנים בלבד (קואליציה = signal, נמנעים ואופוזיציה = צבעי גוש ניטרליים) */
const COL_BG = ["bg-signal text-signal-ink", "bg-[rgb(var(--bloc-4))] text-ink", "bg-[rgb(var(--bloc-5))] text-paper"];
const COL_BAR = ["bg-signal", "bg-[rgb(var(--bloc-4))]", "bg-[rgb(var(--bloc-5))]"];

/** בחירה אחת מתוך אפשרויות: מקטעים שווים בשורה (radiogroup) */
function Single({ q, value, onPick, disabled }: { q: Extract<SurveyQuestion, { kind: "single" }>; value?: string; onPick: (v: string) => void; disabled: boolean }) {
  return (
    <div role="radiogroup" aria-label={q.title} className="grid gap-1 p-1 rounded-2xl bg-[rgb(var(--grid))]" style={{ gridTemplateColumns: `repeat(${Math.min(q.options.length, 3)}, minmax(0, 1fr))` }}>
      {q.options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onPick(o.id)}
            className={`min-h-[48px] rounded-xl px-2 py-1 font-bold ${on ? "bg-signal text-signal-ink shadow" : "text-ink-soft"} disabled:opacity-60`}>
            {o.label}{o.sub && <span className="block text-[11px] font-normal">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** שיוך כל פריט לעמודה (קואליציה / נמנעים / אופוזיציה): לחיצה מסמנת, לחיצה נוספת מבטלת; הסכום מול 61 דביק בראש */
function Assign({ q, value, onChange, disabled }: { q: Extract<SurveyQuestion, { kind: "assign" }>; value: Record<string, string>; onChange: (v: Record<string, string>) => void; disabled: boolean }) {
  const sums = columnSeats(q, value);
  const first = q.columns[0];
  return (
    <div>
      <div className="sticky top-14 z-[2] bg-paper-card pt-1 pb-3">
        <div className="flex justify-between text-sm mb-1.5">
          {q.columns.map((c, i) => <span key={c.id}><b className={`font-num ${i === 0 ? "text-xl text-signal" : ""}`}>{sums[c.id]}</b> {c.label}</span>)}
        </div>
        <div className="relative h-3.5 rounded-full bg-[rgb(var(--grid))] overflow-hidden flex" aria-hidden="true">
          {q.columns.map((c, i) => <span key={c.id} className={`h-full transition-[width] ${COL_BAR[i] ?? "bg-ink-soft"}`} style={{ width: `${(sums[c.id] / 120) * 100}%` }} />)}
        </div>
        <div className="relative h-4" aria-hidden="true">
          <span className="absolute -top-[18px] w-0.5 h-5 bg-ink" style={{ right: `${(MAJORITY - 1) / 120 * 100}%` }} />
          <span className="absolute top-0.5 text-[10.5px] text-ink-soft translate-x-1/2" style={{ right: `${(MAJORITY - 1) / 120 * 100}%` }}>{MAJORITY}</span>
        </div>
        <p className="text-sm font-bold" aria-live="polite">{first ? majorityLine(sums[first.id]) : null}</p>
      </div>
      <ul className="divide-y divide-paper-line border-t border-paper-line">
        {q.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-1.5">
            <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium">{item.label}</span>
            <b className="font-num text-[13px] w-6 text-center">{itemSeats(item)}</b>
            <div role="radiogroup" aria-label={item.label} className="flex gap-0.5 p-0.5 rounded-xl bg-[rgb(var(--grid))]">
              {q.columns.map((c, i) => {
                const on = value[item.id] === c.id;
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={on} aria-label={c.label} disabled={disabled}
                    onClick={() => { const next = { ...value }; if (on) delete next[item.id]; else next[item.id] = c.id; onChange(next); }}
                    className={`min-w-[44px] min-h-[44px] rounded-[10px] px-1.5 text-[11.5px] font-bold ${on ? COL_BG[i] ?? "bg-ink text-paper" : "text-ink-soft"} disabled:opacity-60`}>
                    {c.label.length > 6 ? c.label.slice(0, 4) + "׳" : c.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** תוצאות שאלה: אחוזים לכל אפשרות; בשיוך — לכל פריט פס מחולק לעמודות. מתחת לסף — רק מספר המשתתפים */
function Results({ survey, results }: { survey: SurveyDetail["survey"]; results: SurveyResults }) {
  if ("hidden" in results) return <p className="text-sm text-ink-soft">התוצאות יוצגו מ־{results.min} משתתפים. עד עכשיו: <b className="font-num text-ink">{results.n}</b>.</p>;
  return (
    <div className="space-y-4">
      {survey.questions.map((q) => {
        const r = results.questions[q.id];
        if (!r || r.n === 0) return null;
        return (
          <section key={q.id}>
            <h3 className="text-[15px] font-bold mb-2">{q.title}</h3>
            {q.kind === "single" && "counts" in r && (
              <ul className="space-y-1.5">
                {q.options.map((o) => {
                  const pct = Math.round((r.counts[o.id] / r.n) * 100);
                  return (
                    <li key={o.id} className="grid grid-cols-[110px_minmax(0,1fr)_44px] items-center gap-2 text-sm">
                      <span className="truncate">{o.label}</span>
                      <span className="h-3 rounded-full bg-[rgb(var(--grid))] overflow-hidden"><span className="block h-full bg-signal" style={{ width: `${pct}%` }} /></span>
                      <b className="font-num text-left">{pct}%</b>
                    </li>
                  );
                })}
              </ul>
            )}
            {q.kind === "assign" && "items" in r && (
              <ul className="space-y-1.5">
                {q.items.map((item) => {
                  const row = r.items[item.id], total = q.columns.reduce((n, c) => n + (row?.[c.id] ?? 0), 0);
                  return (
                    <li key={item.id} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2 text-sm">
                      <span className="truncate">{item.label}</span>
                      <span className="h-3 rounded-full bg-[rgb(var(--grid))] overflow-hidden flex" role="img" aria-label={q.columns.map((c) => `${c.label} ${total ? Math.round(((row?.[c.id] ?? 0) / total) * 100) : 0}%`).join(", ")}>
                        {q.columns.map((c, i) => <span key={c.id} className={`h-full ${COL_BAR[i] ?? "bg-ink-soft"}`} style={{ width: `${total ? ((row?.[c.id] ?? 0) / total) * 100 : 0}%` }} />)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** מסך סקר אחד: השאלות, שמירה (היסטוריה מלאה בשרת) ותוצאות הגזרה / כל המשתתפים */
export default function SurveyScreen() {
  const { id = "" } = useParams();
  const session = useSession();
  const { token } = session;
  const [data, setData] = useState<SurveyDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<SurveyAnswers>({});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [scope, setScope] = useState<"group" | "all">("group");

  const load = useCallback(() => {
    getSurvey(id, token).then((d) => { setData(d); setFailed(false); if (d.mine) setDraft(d.mine.answers); }).catch(() => setFailed(true));
  }, [id, token]);
  useEffect(load, [load]);

  const survey = data?.survey;
  const closed = survey?.status !== "open";
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(data?.mine?.answers ?? {}), [draft, data]);
  const empty = Object.keys(draft).length === 0;

  async function save() {
    if (!token || !survey) return;
    setState("saving");
    try { await answerSurvey(token, survey.id, draft); setState("saved"); load(); } catch { setState("error"); }
  }

  if (failed) return <main className="px-4 py-6"><p className="text-ink-soft">הסקר אינו זמין כרגע.</p><Link to="/surveys" className="text-accent">לכל הסקרים</Link></main>;
  if (!survey) return <main className="px-4 py-6"><p className="text-ink-soft">טוען…</p></main>;

  return (
    <main className="px-4 md:px-6 pb-28 space-y-3.5 md:max-w-3xl md:mx-auto">
      <div className="flex items-baseline justify-between gap-2 pt-1">
        <h1 className="text-[26px] font-display leading-tight">{survey.title}</h1>
        {closed && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgb(var(--grid))] text-ink-soft">נסגר</span>}
      </div>
      <p className="text-sm text-ink-soft -mt-2">סקר משתתפים, אינו מייצג.</p>

      {survey.questions.map((q, i) => (
        <section key={q.id} className="f-card">
          <h2 className="text-base font-bold mb-2.5">{i + 1}. {q.title}</h2>
          {q.kind === "single"
            ? <Single q={q} value={draft[q.id] as string | undefined} disabled={closed} onPick={(v) => { setDraft({ ...draft, [q.id]: v }); setState("idle"); }} />
            : <Assign q={q} value={(draft[q.id] as Record<string, string>) ?? {}} disabled={closed} onChange={(v) => { const next = { ...draft }; if (Object.keys(v).length) next[q.id] = v; else delete next[q.id]; setDraft(next); setState("idle"); }} />}
        </section>
      ))}

      {!closed && (token ? (
        <div className="space-y-2">
          <button type="button" onClick={() => void save()} disabled={empty || !changed || state === "saving"} className="f-btn pri w-full !min-h-[50px] !text-base disabled:opacity-50">
            {state === "saving" ? "שומר…" : data?.mine ? "עדכון התשובות" : "שמירת התשובות"}
          </button>
          {state === "saved" && <p role="status" className="text-sm font-bold text-signal">התשובות נשמרו ✓ — הן מופיעות גם באזור האישי</p>}
          {state === "error" && <p role="alert" className="text-sm text-warn">השמירה לא הצליחה. נסו שוב.</p>}
        </div>
      ) : (
        <section className="f-card space-y-2">
          <p className="text-sm">כדי לשמור את התשובות — כניסה עם Google.</p>
          <GoogleButton session={session} onDone={() => void session.refresh()} />
        </section>
      ))}

      <section className="f-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">תוצאות</h2>
          <div className="f-seg sm" role="radiogroup" aria-label="מי נספר">
            <button type="button" aria-pressed={scope === "group"} onClick={() => setScope("group")}>הגזרה</button>
            <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>כל המשתתפים</button>
          </div>
        </div>
        <Results survey={survey} results={data.results[scope]} />
      </section>
    </main>
  );
}
