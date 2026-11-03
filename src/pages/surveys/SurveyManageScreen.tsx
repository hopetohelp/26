import { useCallback, useEffect, useState, type ReactNode } from "react";
import GroupSeriesChart, { type SeriesBucket } from "../../components/GroupSeriesChart";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "../guess/useCrowd";
import CardDrawer from "../../components/CardDrawer";
import { KIND_LABELS, kindLabel, listSurveys, manageSurvey, OUTSIDE_LABELS, STATUS_LABELS, surveyStats, VISIBILITY_LABELS, type Survey, type SurveyKind, type SurveyStats } from "../../lib/surveys";
import SurveyEditor, { type EditorValue } from "./SurveyEditor";

/** הכתובת הישנה (#/surveys/manage) ⇐ מסך "ניהול קבוצה" המאוחד; ?edit=<מזהה> ⇐ ניהול הסקר */
export default function SurveyManageRedirect() {
  const edit = useSearchParams()[0].get("edit");
  return <Navigate to={edit ? `/s/${edit}?manage=1&from=admin` : "/group-admin"} replace />;
}

/** ניחוש מנדטי הבחירות — שורה בטבלת הסטטיסטיקה ובגרף (מסדרת "שמרו ניחוש" של הקבוצה) */
export interface ElectionGuessRow { buckets: SeriesBucket[]; points: (number | null)[] | null; total: number | null }

/**
 * ניהול הסקרים והניחושים במסך "ניהול קבוצה" (הכרעות בעלים 03.11.2026): כפתור יצירה, סיכום, שני גרפים (שמירות, כניסות) עם מתג הגזרה/כולם,
 * מגירת סטטיסטיקה לכל סקר (טבלה, שני גרפים לשורה שנבחרה, וניחוש מנדטי הבחירות — children), ומגירת "ניהול סקרים" עם טבלה שכל תא בה ניתן לשינוי.
 */
export function SurveysManage({ children, election }: { children?: ReactNode; election?: ElectionGuessRow | null }) {
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
  const [stats, setStats] = useState<Record<string, SurveyStats | null>>({});
  useEffect(() => {
    if (!token || !surveys) return;
    for (const s of surveys) surveyStats(token, s.id).then((r) => setStats((o) => ({ ...o, [s.id]: r })), () => setStats((o) => ({ ...o, [s.id]: null })));
  }, [token, surveys]);
  const [scope, setScope] = useState<Scope>("group");

  if (!token || !groups.length) return null;

  async function create() {
    if (!draft) return;
    setMsg(null);
    try {
      await manageSurvey(token!, { group, id: draft.id.trim(), status: "draft", kind, def: { title: draft.title.trim(), questions: draft.questions } });
      navigate(`/s/${draft.id.trim()}?manage=1&from=admin`);
    } catch (e) { setMsg(`היצירה לא הצליחה (${(e as { code?: string }).code ?? "שגיאה"}). בדקו כותרת, מזהה באותיות לטיניות, ולכל שאלה לפחות שתי אפשרויות.`); }
  }
  // שינוי תא בטבלת הניהול — שמירה מיידית של ההגדרה הזו בלבד
  async function update(s: Survey, patch: Record<string, unknown>) {
    setMsg(null);
    try {
      const r = await manageSurvey(token!, { group: s.group, id: s.id, ...patch });
      setSurveys((list) => list?.map((x) => (x.id === s.id ? { ...x, ...r.survey, manage: true } : x)) ?? null);
    } catch (e) { setMsg(`השינוי לא נשמר (${(e as { code?: string }).code ?? "שגיאה"}).`); }
  }
  const list = surveys ?? [];

  return (
    <section className="space-y-3.5">
      <h2 className="text-lg font-bold">סקרים וניחושים</h2>
      {msg && <p role="status" className="text-sm rounded-xl bg-accent-soft px-3 py-2">{msg}</p>}
      {!draft ? <>
        <button type="button" className="f-btn pri" onClick={() => { setDraft({ id: "", title: "", questions: [], isNew: true }); setKind("survey"); }}>ניחוש/סקר חדש</button>
        <StatsSummary surveys={list} stats={stats} />
        {/* שני הגרפים הראשונים: שמירות וכניסות, כל הסקרים יחד, עם מתג הגזרה/כולם */}
        <div className="f-seg fit sm" role="radiogroup" aria-label="מי נספר">
          {SCOPES.map(([k, l]) => <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}>{l}</button>)}
        </div>
        <TwoCharts series={chartSeries(list.map((s) => stats[s.id]).filter((x): x is SurveyStats => !!x), scope)} />
        <CardDrawer title="סטטיסטיקה לכל סקר וניחוש" className="">
          <PerSurvey surveys={list} stats={stats} scope={scope} election={election ?? null} />
          {children}
        </CardDrawer>
        <CardDrawer title="ניהול סקרים" className="">
          <SettingsTable surveys={list} onOpen={(id) => navigate(`/s/${id}?manage=1&from=admin`)} onChange={update} />
        </CardDrawer>
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
    </section>
  );
}

type Scope = "group" | "all";
const SCOPES: [Scope, string][] = [["group", "הגזרה"], ["all", "כולם"]];
type Series = { buckets: SeriesBucket[]; saves: (number | null)[] | null; views: (number | null)[] | null };

/** סדרה מצטברת לפי שעה, מהשעה הראשונה עם נתון ועד עכשיו; scope = כל המשתתפים או חברי הגזרה בלבד */
function chartSeries(list: SurveyStats[], scope: Scope): Series {
  const rows = list.flatMap((x) => (scope === "all" ? x.hours : x.groupHours ?? []));
  const first = rows.map((h) => h.hour).sort()[0];
  if (!first) return { buckets: [], saves: null, views: null };
  const buckets: SeriesBucket[] = [];
  for (let t = Date.parse(first + ":00:00Z"), end = Date.now(); t <= end; t += 36e5) buckets.push({ t: new Date(t).toISOString(), hourly: true });
  const cum = (k: "views" | "saves") => {
    const by = new Map<string, number>();
    for (const h of rows) by.set(h.hour, (by.get(h.hour) ?? 0) + h[k]);
    let t = 0;
    return buckets.map((b) => (t += by.get(b.t.slice(0, 13)) ?? 0));
  };
  return { buckets, saves: cum("saves"), views: cum("views") };
}

/** שני גרפים זה לצד זה: שמירות וכניסות (מצטבר) */
function TwoCharts({ series }: { series: Series }) {
  const one = (label: string, points: (number | null)[] | null) => (
    <section className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-2 min-w-0">
      <div className="flex items-baseline justify-between gap-3"><h3 className="font-bold">{label}</h3><span className="font-num tabular text-2xl leading-none">{points?.length ? points[points.length - 1] : "—"}</span></div>
      {points?.length ? <GroupSeriesChart buckets={series.buckets} points={points} label={label} height={110} /> : null}
    </section>
  );
  return <div className="grid md:grid-cols-2 gap-3">{one("שמירות", series.saves)}{one("כניסות", series.views)}</div>;
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

const ELECTION = "__election";

/** מגירת הסטטיסטיקה: שני גרפים לשורה שנבחרה, וטבלה — לחיצה על שורה מציגה אותה בגרפים */
function PerSurvey({ surveys, stats, scope, election }: { surveys: Survey[]; stats: Record<string, SurveyStats | null>; scope: Scope; election: ElectionGuessRow | null }) {
  const [sel, setSel] = useState<string | null>(null);
  const cur = sel ?? surveys[0]?.id ?? (election ? ELECTION : null);
  const x = cur && cur !== ELECTION ? stats[cur] : null;
  const series: Series = cur === ELECTION && election ? { buckets: election.buckets, saves: election.points, views: null } : x ? chartSeries([x], scope) : { buckets: [], saves: null, views: null };
  const row = (id: string, name: string, cells: (number | null)[]) => (
    <tr key={id} onClick={() => setSel(id)} onKeyDown={(e) => { if (e.key === "Enter") setSel(id); }} tabIndex={0} aria-selected={cur === id}
      className={`border-t border-paper-line cursor-pointer outline-none hover:bg-[rgb(var(--grid))] focus-visible:bg-[rgb(var(--grid))] ${cur === id ? "bg-accent-soft" : ""}`}>
      <td className="py-1.5 px-2">{name}</td>{cells.map((v, i) => <td key={i} className="text-center font-num">{v ?? "—"}</td>)}
    </tr>
  );
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">כניסות וצופים נספרים מהעיצוב החדש</p>
      <TwoCharts series={series} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-ink-soft"><th className="text-start py-1 px-2">שם</th>{COLS.map(([k, l]) => <th key={k} className="text-center px-1">{l}</th>)}</tr></thead>
          <tbody>
            {surveys.map((s) => { const y = stats[s.id]; return row(s.id, `${kindLabel(s.kind)}: ${s.title}`, COLS.map(([k]) => (y ? y[k] : null))); })}
            {/* ניחוש מנדטי הבחירות: רק "שמרו ניחוש" של חברי הקבוצה */}
            {election && row(ELECTION, "ניחוש: מנדטי הבחירות", [null, null, election.total, null, null])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const pick = <T extends string>(list: [T, string][], v: T) => list.find((x) => x[0] === v)?.[1] ?? "";
const nextOf = <T extends string>(list: [T, string][], v: T) => list[(list.findIndex((x) => x[0] === v) + 1) % list.length][0];
/** ISO ⇐ ערך לשדה תאריך ושעה מקומי, ולהפך */
const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

/** כפתור בתא: לחיצה מעבירה לערך הבא */
const Cycle = ({ label, onClick }: { label: string; onClick: () => void }) => <button type="button" className="f-btn !min-h-[34px] !text-[13px] whitespace-nowrap" onClick={onClick}>{label}</button>;

/** טבלת ניהול הסקרים: כל תא ניתן לשינוי בלחיצה; רק לחיצה על השם פותחת את מסך הניהול של הסקר */
function SettingsTable({ surveys, onOpen, onChange }: { surveys: Survey[]; onOpen: (id: string) => void; onChange: (s: Survey, patch: Record<string, unknown>) => Promise<void> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-ink-soft">{["שם", "סוג", "מצב", "מי רואה תוצאות", "מחוץ לגזרה", "סגירה", "סף משתתפים"].map((h) => <th key={h} className="text-start px-2 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {surveys.map((s) => (
            <tr key={s.id} className="border-t border-paper-line">
              <td className="px-2 py-2"><button type="button" className="f-btn !min-h-[34px] !text-[13px] font-bold text-start" onClick={() => onOpen(s.id)}>{s.title}</button></td>
              <td className="px-2 py-2"><Cycle label={kindLabel(s.kind)} onClick={() => void onChange(s, { kind: nextOf(KIND_LABELS, s.kind) })} /></td>
              <td className="px-2 py-2"><Cycle label={pick(STATUS_LABELS, s.status)} onClick={() => void onChange(s, { status: nextOf(STATUS_LABELS, s.status) })} /></td>
              <td className="px-2 py-2"><Cycle label={pick(VISIBILITY_LABELS, s.visibility)} onClick={() => void onChange(s, { visibility: nextOf(VISIBILITY_LABELS, s.visibility) })} /></td>
              <td className="px-2 py-2"><Cycle label={pick(OUTSIDE_LABELS, s.outside ?? "none")} onClick={() => void onChange(s, { outside: nextOf(OUTSIDE_LABELS, s.outside ?? "none") })} /></td>
              <td className="px-2 py-2"><input type="datetime-local" aria-label={`סגירה: ${s.title}`} defaultValue={toLocal(s.closesAt)} className="min-h-[34px] rounded-theme border border-paper-line bg-paper text-ink px-2 font-num"
                onBlur={(e) => { const v = e.target.value ? new Date(e.target.value).toISOString() : null; if (v !== s.closesAt) void onChange(s, { closes_at: v }); }} /></td>
              <td className="px-2 py-2"><input type="number" min={0} aria-label={`סף משתתפים: ${s.title}`} defaultValue={s.minResults} className="w-20 min-h-[34px] rounded-theme border border-paper-line bg-paper text-ink px-2 font-num text-center"
                onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0 && v !== s.minResults) void onChange(s, { min_results: v }); }} /></td>
            </tr>
          ))}
          {!surveys.length && <tr><td colSpan={7} className="px-2 py-3 text-ink-soft">אין עדיין סקרים.</td></tr>}
        </tbody>
      </table>
    </div>
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

const label = <T extends string>(list: [T, string][], v: T) => list.find((x) => x[0] === v)?.[1] ?? "";

/** טבלת הניהול: שורה לכל סקר/ניחוש, טור לכל הגדרה; לחיצה (או Enter) פותחת את הניהול שלו */
function SettingsTable({ surveys, onOpen }: { surveys: Survey[]; onOpen: (id: string) => void }) {
  return (
    <div className="f-card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-ink-soft text-start">{["שם", "סוג", "מצב", "מי רואה תוצאות", "מחוץ לגזרה", "סגירה", "סף משתתפים"].map((h) => <th key={h} className="text-start px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {surveys.map((s) => (
            <tr key={s.id} role="link" tabIndex={0} aria-label={`ניהול: ${s.title}`} onClick={() => onOpen(s.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(s.id); }} className="border-t border-paper-line cursor-pointer hover:bg-[rgb(var(--grid))] focus-visible:bg-[rgb(var(--grid))] outline-none">
              <td className="px-3 py-2 font-bold">{s.title}</td>
              <td className="px-3 py-2 whitespace-nowrap">{kindLabel(s.kind)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{label(STATUS_LABELS, s.status)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{label(VISIBILITY_LABELS, s.visibility)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{label(OUTSIDE_LABELS, s.outside ?? "none")}</td>
              <td className="px-3 py-2 whitespace-nowrap font-num">{closesLabel(s) ?? "—"}</td>
              <td className="px-3 py-2 font-num text-center">{s.minResults}</td>
            </tr>
          ))}
          {!surveys.length && <tr><td colSpan={7} className="px-3 py-3 text-ink-soft">אין עדיין סקרים.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** גרף מצטבר לפי שעה, מהשעה הראשונה עם נתון בכל הסקרים ועד עכשיו; שני חלונות לבחירה (כמו בסטטיסטיקת הקבוצה) */
function SurveysCharts({ surveys, stats }: { surveys: Survey[]; stats: Record<string, SurveyStats | null> }) {
  const got = surveys.filter((s) => stats[s.id]).map((s) => ({ s, x: stats[s.id]! }));
  const first = got.flatMap(({ x }) => x.hours.map((h) => h.hour)).sort()[0];
  if (!first) return null;
  const buckets: SeriesBucket[] = [];
  for (let t = Date.parse(first + ":00:00Z"), end = Date.now(); t <= end; t += 36e5) buckets.push({ t: new Date(t).toISOString(), hourly: true });
  const cum = (list: SurveyStats[], k: "views" | "saves") => {
    const by = new Map<string, number>();
    for (const x of list) for (const h of x.hours) by.set(h.hour, (by.get(h.hour) ?? 0) + h[k]);
    let t = 0;
    return buckets.map((b) => (t += by.get(b.t.slice(0, 13)) ?? 0));
  };
  const all = got.map(({ x }) => x);
  const options = [
    { key: "saves", label: "שמירות — כל הסקרים והניחושים", total: all.reduce((a, x) => a + x.saves, 0), points: cum(all, "saves") },
    { key: "views", label: "כניסות — כל הסקרים והניחושים", total: all.reduce((a, x) => a + x.views, 0), points: cum(all, "views") },
    ...got.flatMap(({ s, x }) => [
      { key: `saves:${s.id}`, label: `שמירות — ${s.title}`, total: x.saves, points: cum([x], "saves") },
      { key: `views:${s.id}`, label: `כניסות — ${s.title}`, total: x.views, points: cum([x], "views") },
    ]),
  ];
  return <StatsCharts storageKey="elections26.surveysCharts" defaults={["saves", "views"]} buckets={buckets} options={options} />;
}
