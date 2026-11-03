import { useEffect, useState } from "react";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import { cached, closesLabel, ELECTION_RESULTS_TITLE, getSurvey, surveyPath, surveysPath, numbered, listSurveys, type Survey, type SurveyDetail } from "../../lib/surveys";
import { isEmbed } from "../../lib/embed";
import { ShareBar, SurveyCard, type CardTag } from "./SurveyCard";

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
            <ShareBar parts={q.options.map((o) => ({ id: o.id, label: o.label, n: qr.counts[o.id] ?? 0 }))} />
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
type Tab = "todo" | "done" | "closed" | "all";
/** תגית מצב / מועד סגירה על הכרטיס */
/** שורה 2 בכרטיס: "נסגר ב…" / "ייסגר ב…" (הכרעת בעלים 03.11.2026) */
const whenText = (s: Survey) => (s.status === "draft" ? "טיוטה" : closesLabel(s) ? `${s.status === "closed" ? "נסגר" : "ייסגר"} ב-${closesLabel(s)}` : null);
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
  const tabs: [Tab, string][] = token ? [["todo", "להשתתף"], ["done", "לעדכן"], ["closed", "סגור"], ["all", "הכל"]] : [["todo", "להשתתף"], ["closed", "סגור"], ["all", "הכל"]];
  // ברירת מחדל "להשתתף"; אם אין שם כלום — "השתתפתי"
  const current: Tab = tab ?? (todo.length || !done.length ? "todo" : "done");

  // תגית: פתוח — "להשתתף" / "לעדכן"; סגור — "השתתפת", ובלי השתתפות אין תגית (הכרעת בעלים 03.11.2026)
  const tagOf = (s: Survey): CardTag => (s.status === "closed" ? (s.answered ? "joined" : null) : !token ? "join" : s.answered ? "update" : "join");
  const row = (s: Survey) => (
    <SurveyCard key={s.id} to={to(s.id)} title={numbered(s)} when={whenText(s)} tag={tagOf(s)}>
      {details[s.id] && <MiniResults detail={details[s.id]} />}
    </SurveyCard>
  );
  // "תוצאות הבחירות" — ניחוש 120 המנדטים (הכרעות בעלים 01.11 ו-02.11.2026): נסגר ויש לו תוצאה
  const legacy = <SurveyCard key="guesses" to="/surveys/guesses" title={ELECTION_RESULTS_TITLE} when="נסגר ב-27.10 21:58" tag={null} />;
  const section = (title: string, items: Survey[], extra?: JSX.Element, first?: JSX.Element) =>
    items.length || extra || first ? (
      <section key={title} className="space-y-2">
        <h2 className="text-base font-bold">{title}</h2>
        <ul className="space-y-2">{first}{items.map(row)}{extra}</ul>
      </section>
    ) : null;

  let content: (JSX.Element | null)[];
  if (current === "all") {
    // "הכל" (הכרעת בעלים 03.11.2026): כל הניחושים והסקרים, לפי המספר
    const byPos = [...all].sort((a, b) => a.position - b.position);
    content = [section("ניחושים", byPos.filter((s) => s.kind === "guess"), undefined, legacy), section("סקרים", byPos.filter((s) => s.kind === "survey"))];
  } else if (current === "closed") {
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
