import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import SurveyAdmin from "./SurveyAdmin";
import Select from "../../components/Select";
import LeaveGuard from "../../components/LeaveGuard";
import { useCrowdDashboard } from "../../lib/sources";
import { VotingStats } from "../guess/Dashboard";

/** "התפלגות המצביעים" — במסך "מה הצבעתם בבחירות (2026)?", עם מעבר לסקר על 2022 (הכרעת בעלים 02.11.2026) */
function VotersCard({ embed }: { embed: boolean }) {
  const d = useCrowdDashboard().dashboard;
  return (
    <section className="f-card space-y-3">
      <h2 className="text-base font-bold">התפלגות המצביעים</h2>
      <p className="text-xs text-ink-soft">הנתונים אינם סקר עדכני אלא חישוב מצטבר מפתיחת האתר, לצורך השוואה של אמינות הניחושים.</p>
      {d ? <VotingStats d={d} /> : <p className="text-sm text-ink-soft">טוען…</p>}
      <Link to={`/s/vote2022${embed ? "?embed=1" : ""}`} className="f-btn">לסקר על הבחירות הקודמות (2022)</Link>
    </section>
  );
}
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import ConfirmDialog from "../../components/ConfirmDialog";
import { isEmbed } from "../../lib/embed";
import { useHostLogin } from "../../lib/embedLogin";
import { answerSurvey, brokenPromises, closesLabel, viewSurvey, columnSeats, getSurvey, itemSeats, numbered, cached, surveyPath, updatedLabel, majorityLine, MAJORITY, type AssignValue, type ElectionPromise, type SurveyAnswers, type SurveyDetail, type SurveyQuestion, type SurveyResults } from "../../lib/surveys";

/** צבעי שלוש העמודות בשאלת שיוך — מהטוקנים בלבד (קואליציה = signal, נמנעים ואופוזיציה = צבעי גוש ניטרליים) */
const COL_BG = ["bg-signal text-signal-ink", "bg-[rgb(var(--bloc-4))] text-ink", "bg-[rgb(var(--bloc-5))] text-paper"];
const COL_BAR = ["bg-signal", "bg-[rgb(var(--bloc-4))]", "bg-[rgb(var(--bloc-5))]"];

/** מעל מספר זה של אפשרויות — תפריט בחירה נפתח במקום כפתורים (הכרעת בעלים 02.11.2026) */
const SELECT_FROM = 7;
/** בחירה אחת מתוך אפשרויות: מקטעים שווים בשורה (radiogroup), או תפריט בחירה נפתח לרשימה ארוכה */
function Single({ q, value, onPick, disabled }: { q: Extract<SurveyQuestion, { kind: "single" }>; value?: string; onPick: (v: string) => void; disabled: boolean }) {
  if (q.options.length >= SELECT_FROM)
    return (
      <Select id={`q-${q.id}`} label={q.title || "בחירה"} inline value={value ?? ""} onChange={(v) => v && onPick(v)}>
        <option value="" disabled>בחירה…</option>
        {q.options.map((o) => <option key={o.id} value={o.id} disabled={disabled}>{o.label}{o.sub ? ` · ${o.sub}` : ""}</option>)}
      </Select>
    );
  return (
    <div role="radiogroup" aria-label={q.title || "בחירה"} className="grid gap-1 p-1 rounded-2xl bg-[rgb(var(--grid))]" style={{ gridTemplateColumns: `repeat(${Math.min(q.options.length, 3)}, minmax(0, 1fr))` }}>
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

/** פיצול סיעה בין העמודות (הכרעת בעלים 01.11.2026): מנדטים לכל עמודה, עד מספר המנדטים של הסיעה */
function SplitEditor({ q, seats, value, onChange, disabled }: { q: Extract<SurveyQuestion, { kind: "assign" }>; seats: number; value: Record<string, number>; onChange: (v: Record<string, number> | null) => void; disabled: boolean }) {
  const used = Object.values(value).reduce((x, y) => x + y, 0);
  const set = (c: string, n: number) => { const next = { ...value, [c]: n }; if (!n) delete next[c]; onChange(Object.keys(next).length ? next : null); };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-2 text-[13px]">
      {q.columns.map((c, i) => {
        const n = value[c.id] ?? 0;
        return (
          <span key={c.id} className="inline-flex items-center gap-1">
            <i className={`w-2.5 h-2.5 rounded-sm ${COL_BAR[i] ?? "bg-ink-soft"}`} aria-hidden="true" />{c.label}
            <button type="button" disabled={disabled || n === 0} onClick={() => set(c.id, n - 1)} aria-label={`פחות ל${c.label}`} className="w-8 h-8 rounded-full border border-paper-line disabled:opacity-40">−</button>
            <b className="font-num w-5 text-center" aria-live="polite">{n}</b>
            <button type="button" disabled={disabled || used >= seats} onClick={() => set(c.id, n + 1)} aria-label={`עוד ל${c.label}`} className="w-8 h-8 rounded-full border border-paper-line disabled:opacity-40">+</button>
          </span>
        );
      })}
      <span className="text-ink-soft">לא סומנו: <b className="font-num">{seats - used}</b></span>
    </div>
  );
}

/** שיוך כל פריט לעמודה (קואליציה / נמנעים / אופוזיציה): לחיצה מסמנת, לחיצה נוספת מבטלת; "חלק" מפצל את הסיעה; הסכום מול 61 דביק בראש */
function Assign({ q, value, onChange, disabled }: { q: Extract<SurveyQuestion, { kind: "assign" }>; value: Record<string, AssignValue>; onChange: (v: Record<string, AssignValue>) => void; disabled: boolean }) {
  const sums = columnSeats(q, value);
  const first = q.columns[0];
  const [open, setOpen] = useState<string | null>(null);
  const broken = brokenPromises(value, first?.id);
  const update = (item: string, v: AssignValue | null) => { const next = { ...value }; if (v === null) delete next[item]; else next[item] = v; onChange(next); };
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
        {broken.length > 0 && <p className="text-[13px] text-warn mt-1">הקואליציה הזו מפרה {broken.length === 1 ? "הבטחת בחירות אחת" : `${broken.length} הבטחות בחירות`}: {broken.map((p) => p.speaker).join(", ")}</p>}
      </div>
      <ul className="divide-y divide-paper-line border-t border-paper-line">
        {q.items.map((item) => {
          const v = value[item.id], split = typeof v === "object";
          return (
            <li key={item.id}>
              <div className="flex items-center gap-2 py-1.5">
                <span className="flex-1 min-w-0 text-[13.5px] font-medium leading-tight">{item.label}</span>
                <b className="font-num text-[13px] w-6 text-center">{itemSeats(item)}</b>
                <div role="radiogroup" aria-label={item.label} className="flex gap-0.5 p-0.5 rounded-xl bg-[rgb(var(--grid))]">
                  {q.columns.map((c, i) => {
                    const on = v === c.id;
                    return (
                      <button key={c.id} type="button" role="radio" aria-checked={on} aria-label={c.label} disabled={disabled}
                        onClick={() => { setOpen(null); update(item.id, on ? null : c.id); }}
                        className={`min-w-[44px] min-h-[44px] rounded-[10px] px-1.5 text-[11.5px] font-bold ${on ? COL_BG[i] ?? "bg-ink text-paper" : "text-ink-soft"} disabled:opacity-60`}>
                        {c.label.length > 5 ? c.label.slice(0, 4) + "׳" : c.label}
                      </button>
                    );
                  })}
                  <button type="button" aria-pressed={split || open === item.id} aria-label={`חלק מ${item.label}`} disabled={disabled}
                    onClick={() => setOpen(open === item.id ? null : item.id)}
                    className={`min-w-[44px] min-h-[44px] rounded-[10px] px-1.5 text-[11.5px] font-bold ${split ? "bg-ink text-paper" : "text-ink-soft"} disabled:opacity-60`}>חלק</button>
                </div>
              </div>
              {(open === item.id || split) && (
                <SplitEditor q={q} seats={itemSeats(item)} disabled={disabled} value={split ? v as Record<string, number> : {}} onChange={(nv) => update(item.id, nv)} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** בחירה מטווח (הכרעת בעלים 01.11.2026): מחוון ומספר גדול; תוויות לשני הקצוות */
function Range({ q, value, onPick, disabled }: { q: Extract<SurveyQuestion, { kind: "range" }>; value?: number; onPick: (v: number) => void; disabled: boolean }) {
  const v = value ?? Math.round((q.min + q.max) / 2 / q.step) * q.step;
  return (
    <div className="space-y-1.5">
      <div className="text-center"><b className="font-num text-3xl">{value ?? "—"}</b></div>
      <input type="range" dir="ltr" min={q.min} max={q.max} step={q.step} value={v} disabled={disabled} aria-label={q.title || "בחירה"}
        onChange={(e) => onPick(Number(e.target.value))} className="w-full accent-[rgb(var(--signal))]" />
      <div className="flex justify-between text-xs text-ink-soft" dir="ltr"><span>{q.min}{q.minLabel ? ` · ${q.minLabel}` : ""}</span><span>{q.max}{q.maxLabel ? ` · ${q.maxLabel}` : ""}</span></div>
    </div>
  );
}

/** תוצאות שאלה: אחוזים לכל אפשרות; בשיוך — לכל פריט פס מחולק לעמודות. מתחת לסף — רק מספר המשתתפים */
function Results({ survey, results, mine }: { survey: SurveyDetail["survey"]; results: SurveyResults; mine?: SurveyAnswers }) {
  if ("hidden" in results) return <p className="text-sm text-ink-soft">התוצאות יוצגו מ־{results.min} משתתפים. עד עכשיו: <b className="font-num text-ink">{results.n}</b>.</p>;
  return (
    <div className="space-y-4">
      {survey.questions.map((q) => {
        const r = results.questions[q.id];
        if (!r || r.n === 0) return null;
        return (
          <section key={q.id}>
            {q.title && <h3 className="text-[15px] font-bold mb-2">{q.title}</h3>}
            {/* ניחוש: תוצאת האמת שהזין המנהל, ומה ניחשת */}
            {survey.kind === "guess" && survey.truth?.[q.id] !== undefined && (
              <p className="text-sm rounded-xl bg-accent-soft px-3 py-1.5 mb-2">
                בפועל: <b>{q.kind === "single" ? q.options.find((o) => o.id === survey.truth?.[q.id])?.label : String(survey.truth[q.id])}</b>
                {mine?.[q.id] !== undefined && <> · {mine[q.id] === survey.truth[q.id] ? "צדקת ✓" : "ניחשת אחרת"}</>}
              </p>
            )}
            {q.kind === "range" && "counts" in r && (
              <div className="space-y-1">
                <p className="text-sm">ממוצע: <b className="font-num">{r.mean ?? "—"}</b></p>
                <div className="flex items-end gap-0.5 h-16" role="img" aria-label={Object.entries(r.counts).map(([v, n]) => `${v}: ${n}`).join(", ")}>
                  {Array.from({ length: (q.max - q.min) / q.step + 1 }, (_, i) => q.min + i * q.step).map((v) => {
                    const n = r.counts[v] ?? 0, top = Math.max(...Object.values(r.counts), 1);
                    return <span key={v} className={`flex-1 rounded-t ${survey.truth?.[q.id] === v ? "bg-ink" : "bg-signal"}`} style={{ height: `${(n / top) * 100}%`, minHeight: n ? 3 : 1 }} title={`${v}: ${n}`} />;
                  })}
                </div>
                <div className="flex justify-between text-xs text-ink-soft" dir="ltr"><span>{q.min}</span><span>{q.max}</span></div>
              </div>
            )}
            {q.kind === "single" && "counts" in r && (
              <ul className="space-y-1.5">
                {/* רק אפשרויות שקיבלו תשובה, מהגבוהה לנמוכה (הכרעת בעלים 03.11.2026) */}
                {q.options.filter((o) => (r.counts[o.id] ?? 0) > 0).sort((a, b) => r.counts[b.id] - r.counts[a.id]).map((o) => {
                  const pct = Math.round((r.counts[o.id] / r.n) * 100);
                  return (
                    <li key={o.id} className="grid grid-cols-[110px_minmax(0,1fr)_44px] items-center gap-2 text-sm">
                      <span className="truncate">{survey.truth?.[q.id] === o.id ? "✓ " : ""}{o.label}</span>
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

/** מסך סקר אחד: השאלות, שמירה (היסטוריה מלאה בשרת) ותוצאות; למנהלים — כפתור "ניהול" שמחליף את הסקר במצב הניהול */
export default function SurveyScreen() {
  const { id = "" } = useParams();
  const session = useSession();
  const { token } = session;
  const embed = isEmbed();
  // בחלון מוטמע באתר הגזרה — כניסה אוטומטית עם החשבון של האתר המארח (src/lib/embedLogin.ts)
  useHostLogin(session, embed);
  const [params, setParams] = useSearchParams();
  const managing = params.has("manage") && !embed;
  const navigate = useNavigate();
  // הצגה מיידית מהעותק שבמכשיר; הגרסה מהשרת מחליפה אותה (בלי לדרוס תשובה שהמשתתף כבר התחיל לשנות)
  const [data, setData] = useState<SurveyDetail | null>(() => cached<SurveyDetail>(surveyPath(id), token));
  const [failed, setFailed] = useState(false);
  const [draft, setDraftRaw] = useState<SurveyAnswers>(() => cached<SurveyDetail>(surveyPath(id), token)?.mine?.answers ?? {});
  const touched = useRef(false);
  const setDraft: typeof setDraftRaw = (v) => { touched.current = true; setDraftRaw(v); };
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [scope, setScope] = useState<"group" | "all">("group");
  /** שינוי שמפר הבטחת בחירות — ממתין לאישור "להפר הבטחת בחירות" או לביטול */
  /** atSave — הבטחת "רק עם" נבדקת רק בשמירה (כדי שסימון הרשימה הראשונה לא יפתח חלון) */
  const [pending, setPending] = useState<{ next: SurveyAnswers; promises: ElectionPromise[]; atSave?: boolean } | null>(null);

  const load = useCallback(() => {
    getSurvey(id, token).then((d) => { setData(d); setFailed(false); if (d.mine && !touched.current) setDraftRaw(d.mine.answers); }).catch(() => setFailed(true));
  }, [id, token]);
  useEffect(load, [load]);
  // כניסה לסקר — לסטטיסטיקה של המנהלים (פעם אחת לטעינה)
  useEffect(() => { if (id) void viewSurvey(token, id, embed).catch(() => {}); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const survey = data?.survey;
  // סגור, או מחוץ לגזרה בלי הרשאת השתתפות ⇐ צפייה בלבד
  const closed = survey?.status !== "open" || !data?.access.canAnswer;
  const outsider = !!data && !data.access.member;
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(data?.mine?.answers ?? {}), [draft, data]);
  const empty = Object.keys(draft).length === 0;
  const setManaging = (on: boolean) => { const p = new URLSearchParams(params); if (on) p.set("manage", "1"); else p.delete("manage"); setParams(p, { replace: true }); };

  async function save(confirmed = false): Promise<boolean> {
    if (!token || !survey) return false;
    // בשמירה: הבטחות "רק עם" שהקואליציה מפרה ⇐ חלון לפני השמירה
    if (!confirmed) {
      const atSave = survey.questions.flatMap((q) => q.kind === "assign" ? brokenPromises(draft[q.id] as Record<string, AssignValue> | undefined, q.columns[0]?.id).filter((p) => p.with?.length) : []);
      if (atSave.length) { setPending({ next: draft, promises: atSave, atSave: true }); return false; }
    }
    setState("saving");
    try { await answerSurvey(token, survey.id, draft); setState("saved"); touched.current = false; load(); return true; } catch { setState("error"); return false; }
  }
  const allLink = embed ? "/surveys?embed=1" : "/surveys";

  if (failed) return (
    <main className="px-4 py-6 space-y-3 md:max-w-3xl md:mx-auto">
      {token ? <p className="text-ink-soft">הסקר אינו זמין.</p> : <>
        <p>סקרי הגזרה פתוחים לחברי הגזרה. כניסה עם Google:</p>
        <GoogleButton session={session} onDone={() => void session.refresh()} />
      </>}
      <Link to={allLink} className="f-btn">לכל הסקרים</Link>
    </main>
  );
  if (!survey) return <main className="px-4 py-6"><p className="text-ink-soft">טוען…</p></main>;
  const deadline = closesLabel(survey);
  const bothScopes = data.access.outside === "answer";
  const noResults = survey.visibility === "after_close" ? "התוצאות יוצגו עם סגירת הסקר." : survey.visibility === "answered" ? "התוצאה העדכנית מוצגת אחרי ששומרים תשובה." : "אין עדיין תוצאות.";

  return (
    <>
    <LeaveGuard dirty={!!token && changed && !managing && state !== "saving"} onSave={() => save()} />
    <main className="px-4 md:px-6 pb-28 space-y-3.5 md:max-w-3xl md:mx-auto">
      <div className="flex items-start justify-between gap-2 pt-1">
        <h1 className="text-[26px] font-display leading-tight">{numbered(survey)}</h1>
        {data.access.manage && !embed && token && <button type="button" className={`f-btn shrink-0 ${managing ? "pri" : ""}`} aria-pressed={managing} onClick={() => setManaging(!managing)}>ניהול</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 -mt-1.5 text-sm text-ink-soft">
        <span>{survey.kind === "guess" ? "ניחוש משתתפים" : "סקר משתתפים, אינו מייצג"}</span>
        {closed && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgb(var(--grid))]">נסגר</span>}
        {deadline && survey.status === "open" && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent-soft text-ink">פתוח עד {deadline}</span>}
      </div>
      {embed && <Link to={allLink} className="f-btn">› לכל הסקרים</Link>}

      {managing && token ? (
        <SurveyAdmin survey={{ ...survey, outside: data.access.outside }} token={token} onDone={() => { setManaging(false); load(); }} onDeleted={() => navigate("/surveys")} />
      ) : <>
        {outsider && survey.status === "open" && !data.access.canAnswer && <p className="text-sm rounded-xl bg-accent-soft px-3 py-2">הסקר פתוח להשתתפות לחברי הגזרה. אפשר לצפות בשאלות.</p>}

        {survey.questions.map((q, i) => (
          <section key={q.id} className="f-card">
            {q.title && <h2 className="text-base font-bold mb-2.5">{survey.questions.length > 1 ? `${i + 1}. ` : ""}{q.title}</h2>}
            {q.kind === "single"
              ? <Single q={q} value={draft[q.id] as string | undefined} disabled={closed} onPick={(v) => { setDraft({ ...draft, [q.id]: v }); setState("idle"); }} />
              : q.kind === "range"
              ? <Range q={q} value={draft[q.id] as number | undefined} disabled={closed} onPick={(v) => { setDraft({ ...draft, [q.id]: v }); setState("idle"); }} />
              : <Assign q={q} value={(draft[q.id] as Record<string, AssignValue>) ?? {}} disabled={closed} onChange={(v) => {
                  const next = { ...draft }; if (Object.keys(v).length) next[q.id] = v; else delete next[q.id];
                  // צירוף חדש שמפר הבטחת בחירות ⇐ חלון עם האומר והציטוט
                  const before = new Set(brokenPromises(draft[q.id] as Record<string, AssignValue> | undefined, q.columns[0]?.id).map((p) => p.id));
                  const fresh = brokenPromises(v, q.columns[0]?.id).filter((p) => !before.has(p.id) && !p.with?.length);
                  if (fresh.length) setPending({ next, promises: fresh }); else { setDraft(next); setState("idle"); }
                }} />}
          </section>
        ))}

        {survey.status === "open" && (data.access.canAnswer || !token) && (token ? (
          <div className="space-y-2">
            <button type="button" onClick={() => void save()} disabled={empty || !changed || state === "saving"} className="f-btn pri w-full !min-h-[50px] !text-base disabled:opacity-50">
              {state === "saving" ? "שומר…" : data?.mine ? "עדכון התשובות" : "שמירת התשובות"}
            </button>
            {state === "saved" && <p role="status" className="text-sm font-bold text-signal">התשובות נשמרו ✓ — הן מופיעות גם באזור האישי</p>}
            {state !== "saved" && data?.mine && <p className="text-sm text-ink-soft text-center">{updatedLabel(data.mine.at)}</p>}
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
            {/* מתג הגזרה / כל המשתתפים — רק כשמי שמחוץ לגזרה רשאי לענות (הכרעת בעלים 02.11.2026) */}
            {data.results && bothScopes && <div className="f-seg sm" role="radiogroup" aria-label="מי נספר">
              <button type="button" aria-pressed={scope === "group"} onClick={() => setScope("group")}>הגזרה</button>
              <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>כל המשתתפים</button>
            </div>}
          </div>
          {data.results ? <Results survey={survey} results={data.results[bothScopes ? scope : "group"]} mine={data.mine?.answers} /> : <p className="text-sm text-ink-soft">{noResults}</p>}
        </section>
        {survey.id === "vote" && <VotersCard embed={embed} />}
      </>}

      {pending && (
        <ConfirmDialog title="הצירוף הזה מפר הבטחת בחירות" confirm="להפר הבטחת בחירות"
          onConfirm={() => { const atSave = pending.atSave; setDraft(pending.next); setState("idle"); setPending(null); if (atSave) void save(true); }} onCancel={() => setPending(null)}>
          {pending.promises.map((p) => (
            <figure key={p.id} className="border-r-4 border-paper-line pr-3 space-y-1">
              <blockquote className="text-base">״{p.quote}״</blockquote>
              {/* קישור טקסט — חריג מוצדק: הפניה למקור הציטוט באתר חיצוני, בתוך שורת הקרדיט */}
              <figcaption className="text-ink-soft">{p.speaker}{p.role ? `, ${p.role}` : ""} · {p.date} · <a href={p.source} target="_blank" rel="noopener" className="text-accent">{p.sourceName}</a></figcaption>
            </figure>
          ))}
        </ConfirmDialog>
      )}
    </main>
    </>
  );
}
