import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import CardDrawer from "../../components/CardDrawer";
import { KIND_LABELS, kindLabel, listSurveys, manageSurvey, OUTSIDE_LABELS, STATUS_LABELS, surveyStats, type Survey, type SurveyKind, type SurveyStats } from "../../lib/surveys";
import SurveyEditor, { type EditorValue } from "./SurveyEditor";

/**
 * ניהול סקרים למנהלי הגזרה (הכרעת בעלים 01.11.2026): רשימת הסקרים שלי ו"סקר חדש".
 * הניהול של סקר קיים — בתוך מסך הסקר, בכפתור "ניהול" (#/s/<מזהה>?manage=1). בשלב הראשון בלי קישור מאף מסך.
 */
export default function SurveyManageScreen() {
  const session = useSession();
  const { token, me } = session;
  const navigate = useNavigate();
  const groups = me?.managedGroups ?? [];
  const group = groups[0]?.id ?? "";
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [draft, setDraft] = useState<EditorValue | null>(null);
  const [kind, setKind] = useState<SurveyKind>("survey");
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => { listSurveys(token).then((r) => setSurveys(r.surveys.filter((s) => s.manage))).catch(() => setMsg("רשימת הסקרים אינה זמינה כרגע.")); }, [token]);
  useEffect(load, [load]);
  // סטטיסטיקה לכל סקר/ניחוש — לסיכום המרוכז ולטבלה שבמגירה (הכרעת בעלים 03.11.2026)
  const [stats, setStats] = useState<Record<string, SurveyStats | null>>({});
  useEffect(() => {
    if (!token || !surveys) return;
    for (const s of surveys) surveyStats(token, s.id).then((r) => setStats((o) => ({ ...o, [s.id]: r })), () => setStats((o) => ({ ...o, [s.id]: null })));
  }, [token, surveys]);
  // קישורים ישנים לעריכה (?edit=<מזהה>) ⇐ מצב הניהול שבמסך הסקר
  const edit = useSearchParams()[0].get("edit");
  if (edit) return <Navigate to={`/s/${edit}?manage=1`} replace />;

  if (!token) return <main className="px-4 md:px-6 pb-28 space-y-3 md:max-w-3xl md:mx-auto"><h1 className="text-[26px] font-display pt-1">ניהול סקרים</h1><p>כניסה עם Google:</p><GoogleButton session={session} onDone={() => void session.refresh()} /></main>;
  if (me && !groups.length) return <main className="px-4 md:px-6 pb-28 md:max-w-3xl md:mx-auto"><h1 className="text-[26px] font-display pt-1">ניהול סקרים</h1><p className="text-ink-soft">המסך הזה למנהלי קבוצה בלבד.</p></main>;

  async function create() {
    if (!draft) return;
    setMsg(null);
    try {
      await manageSurvey(token!, { group, id: draft.id.trim(), status: "draft", kind, def: { title: draft.title.trim(), questions: draft.questions } });
      navigate(`/s/${draft.id.trim()}?manage=1`);
    } catch (e) { setMsg(`היצירה לא הצליחה (${(e as { code?: string }).code ?? "שגיאה"}). בדקו כותרת, מזהה באותיות לטיניות, ולכל שאלה לפחות שתי אפשרויות.`); }
  }

  return (
    <main className="px-4 md:px-6 pb-28 space-y-3.5 md:max-w-3xl md:mx-auto">
      <h1 className="text-[26px] font-display pt-1">ניהול קבוצה</h1>
      {msg && <p role="status" className="text-sm rounded-xl bg-accent-soft px-3 py-2">{msg}</p>}
      {!draft ? <>
        {/* 1. יצירה */}
        <button type="button" className="f-btn pri" onClick={() => { setDraft({ id: "", title: "", questions: [], isNew: true }); setKind("survey"); }}>ניחוש/סקר חדש</button>
        {/* 2. סטטיסטיקה מרוכזת על כל הסקרים והניחושים */}
        <StatsSummary surveys={surveys ?? []} stats={stats} />
        {/* 3. מגירה: טבלת סטטיסטיקה לכל סקר/ניחוש */}
        <CardDrawer title="סטטיסטיקה לכל סקר וניחוש" className="">
          <StatsTable surveys={surveys ?? []} stats={stats} />
        </CardDrawer>
        {/* 4. אזור ניהול */}
        <h2 className="text-base font-bold pt-2">ניהול</h2>
        <ul className="f-card !p-0 divide-y divide-paper-line">
          {(surveys ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 min-w-0"><b className="block">{s.title}</b>
                <span className="text-[12.5px] text-ink-soft">{kindLabel(s.kind)} · {STATUS_LABELS.find((x) => x[0] === s.status)?.[1]} · מחוץ לגזרה: {OUTSIDE_LABELS.find((x) => x[0] === (s.outside ?? "none"))?.[1]}</span></span>
              <Link to={`/s/${s.id}?manage=1`} className="f-btn">ניהול</Link>
            </li>
          ))}
          {surveys && !surveys.length && <li className="px-4 py-3 text-ink-soft">אין עדיין סקרים.</li>}
        </ul>
        <Link to="/group-admin" className="f-btn">ניהול הקבוצה</Link>
      </> : (
        <section className="f-card space-y-3">
          <h2 className="text-base font-bold">סקר חדש</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold">סוג</span>
            <div className="f-seg sm" role="radiogroup" aria-label="סוג">{KIND_LABELS.map(([k, l]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}</div>
          </div>
          <SurveyEditor value={draft} onChange={setDraft} />
          <p className="text-xs text-ink-soft">הסקר נוצר כטיוטה. אחרי היצירה נפתח מצב הניהול שלו: מצב, מועד סגירה, מי רואה תוצאות ועוד.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="f-btn pri" onClick={() => void create()}>יצירה</button>
            <button type="button" className="f-btn" onClick={() => { setDraft(null); setMsg(null); }}>ביטול</button>
          </div>
        </section>
      )}
    </main>
  );
}

type StatKey = "views" | "viewers" | "members" | "outsiders" | "changed";
const COLS: [StatKey, string][] = [["views", "כניסות"], ["viewers", "צופים שונים"], ["members", "שמרו — מהגזרה"], ["outsiders", "שמרו — מחוץ לגזרה"], ["changed", "עדכנו תשובה"]];

/** סיכום מרוכז: סכום כל הסקרים והניחושים */
function StatsSummary({ surveys, stats }: { surveys: Survey[]; stats: Record<string, SurveyStats | null> }) {
  const got = surveys.map((s) => stats[s.id]).filter((x): x is SurveyStats => !!x);
  if (!got.length) return null;
  const sum = (k: StatKey) => got.reduce((a, x) => a + x[k], 0);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div className="rounded-xl bg-[rgb(var(--grid))] px-3 py-2 text-center"><b className="block font-num text-xl">{surveys.length}</b><span className="text-xs text-ink-soft">סקרים וניחושים</span></div>
      {COLS.map(([k, l]) => <div key={k} className="rounded-xl bg-[rgb(var(--grid))] px-3 py-2 text-center"><b className="block font-num text-xl">{sum(k)}</b><span className="text-xs text-ink-soft">{l}</span></div>)}
    </div>
  );
}

/** טבלה: שורה לכל סקר/ניחוש */
function StatsTable({ surveys, stats }: { surveys: Survey[]; stats: Record<string, SurveyStats | null> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-ink-soft"><th className="text-start py-1">שם</th>{COLS.map(([k, l]) => <th key={k} className="text-center px-1">{l}</th>)}</tr></thead>
        <tbody>{surveys.map((s) => { const x = stats[s.id]; return (
          <tr key={s.id} className="border-t border-paper-line"><td className="py-1">{kindLabel(s.kind)}: {s.title}</td>{COLS.map(([k]) => <td key={k} className="text-center font-num">{x ? x[k] : "—"}</td>)}</tr>
        ); })}</tbody>
      </table>
    </div>
  );
}
