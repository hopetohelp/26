import { useEffect, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import CardDrawer from "../../components/CardDrawer";
import GroupSeriesChart, { type SeriesBucket } from "../../components/GroupSeriesChart";
import { SITE_ORIGIN } from "../../lib/embed";
import {
  KIND_LABELS, manageSurvey, OUTSIDE_LABELS, STATUS_LABELS, surveyStats, VISIBILITY_LABELS,
  type Survey, type SurveyKind, type SurveyOutside, type SurveyStats, type SurveyVisibility,
} from "../../lib/surveys";
import SurveyEditor, { type EditorValue } from "./SurveyEditor";

/** ISO ⇐ ערך לשדה תאריך ושעה מקומי, ולהפך */
const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** בורר אחד מכמה, כמתג (כפתורים במסגרת — הנחיית העיצוב: אין טקסט־קישור במקום כפתור) */
function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-sm font-bold min-w-[8.5rem]">{label}</span>
      <div className="f-seg sm" role="radiogroup" aria-label={label}>
        {options.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
      </div>
    </div>
  );
}

/** תיבת נתון בסטטיסטיקה */
const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-xl bg-[rgb(var(--grid))] px-3 py-2 text-center"><b className="block font-num text-xl">{value}</b><span className="text-xs text-ink-soft">{label}</span></div>
);

/**
 * מצב ניהול בתוך מסך הסקר (הכרעת בעלים 01.11.2026): מנהל נכנס לסקר כרגיל, ורק אחרי "ניהול" נפתחים — במקום הסקר — הסטטיסטיקות,
 * ההגדרות (סוג, מצב, מועד סגירה, מתי רואים תוצאות, סף משתתפים, גישה מחוץ לגזרה), תוצאות האמת בניחוש, עריכת השאלות, ההטמעה והמחיקה.
 */
export default function SurveyAdmin({ survey, token, onDone, onDeleted }: { survey: Survey; token: string; onDone: () => void; onDeleted: () => void }) {
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  useEffect(() => { surveyStats(token, survey.id).then(setStats, () => setStatsFailed(true)); }, [token, survey.id]);

  const [kind, setKind] = useState<SurveyKind>(survey.kind);
  const [status, setStatus] = useState(survey.status);
  const [closesAt, setClosesAt] = useState(toLocal(survey.closesAt));
  const [visibility, setVisibility] = useState<SurveyVisibility>(survey.visibility);
  const [minResults, setMinResults] = useState(survey.minResults);
  const [outside, setOutside] = useState<SurveyOutside>(survey.outside ?? "none");
  const [truth, setTruth] = useState<Record<string, string | number>>(survey.truth ?? {});
  const [editor, setEditor] = useState<EditorValue>({ id: survey.id, title: survey.title, questions: survey.questions, isNew: false });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await manageSurvey(token, {
        group: survey.group, id: survey.id, def: { title: editor.title.trim(), questions: editor.questions },
        status, kind, visibility, min_results: minResults, closes_at: fromLocal(closesAt), outside, truth: kind === "guess" && Object.keys(truth).length ? truth : null,
      });
      setMsg("נשמר ✓");
      onDone();
    } catch (e) { setMsg(`השמירה לא הצליחה (${(e as { code?: string }).code ?? "שגיאה"}). בדקו שלכל שאלה נוסח ולפחות שתי אפשרויות.`); }
    finally { setBusy(false); }
  }
  async function remove() {
    try { await manageSurvey(token, { group: survey.group, id: survey.id, delete: true, confirm: "מחק" }); onDeleted(); } catch { setMsg("המחיקה לא הצליחה."); }
  }
  const code = surveyEmbedCode(survey.id, survey.title);
  // שמרו מתוך הצופים — רק מתחילת ספירת הכניסות (הכרעת בעלים 02.11.2026)
  const conversion = stats && stats.viewers ? Math.min(100, Math.round((stats.saversSinceViews / stats.viewers) * 100)) : null;
  // הכרטיסים לפי גודל המספר, מהגדול לקטן (הכרעת בעלים 02.11.2026); שמירות ומשתתפים ששמרו — הוסרו, כי הפירוט בכרטיסים האחרים
  const tiles: [string, number][] = stats ? ([["כניסות", stats.views], ["צופים שונים", stats.viewers], ["מתוך הטמעה", stats.embedViews], ["שמרו — מהגזרה", stats.members], ["שמרו — מחוץ לגזרה", stats.outsiders], ["עדכנו תשובה", stats.changed]] as [string, number][]).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="space-y-3.5">
      <section className="f-card space-y-3">
        <h2 className="text-base font-bold">סטטיסטיקות</h2>
        {statsFailed && <p className="text-sm text-ink-soft">הסטטיסטיקות אינן זמינות כרגע.</p>}
        {!stats && !statsFailed && <p className="text-sm text-ink-soft">טוען…</p>}
        {stats && <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tiles.map(([l, v]) => <Tile key={l} label={l} value={v} />)}
          </div>
          {conversion !== null && <p className="text-sm text-ink-soft">שמרו מתוך הצופים{stats.viewsSince ? ` (מ־${stats.viewsSince.split("-").reverse().slice(0, 2).join(".")})` : ""}: <b className="font-num text-ink">{conversion}%</b></p>}
          <StatsDrawer stats={stats} />
        </>}
      </section>

      <section className="f-card space-y-3">
        <h2 className="text-base font-bold">הגדרות</h2>
        <Seg label="סוג" value={kind} options={KIND_LABELS} onChange={setKind} />
        <Seg label="מצב" value={status} options={STATUS_LABELS} onChange={setStatus} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label htmlFor="closes-at" className="text-sm font-bold min-w-[8.5rem]">מועד סגירה</label>
          <input id="closes-at" type="datetime-local" dir="ltr" className="rounded-xl border border-paper-line bg-paper px-3 py-2" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          {closesAt && <button type="button" className="f-btn !min-h-[36px]" onClick={() => setClosesAt("")}>בלי מועד</button>}
        </div>
        <Seg label="מי רואה תוצאות" value={visibility} options={VISIBILITY_LABELS} onChange={setVisibility} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label htmlFor="min-results" className="text-sm font-bold min-w-[8.5rem]">תוצאות מ־</label>
          <input id="min-results" type="number" min={1} dir="ltr" className="w-24 rounded-xl border border-paper-line bg-paper px-3 py-2" value={minResults} onChange={(e) => setMinResults(Math.max(1, Number(e.target.value) || 1))} />
          <span className="text-sm text-ink-soft">משתתפים (מתחת לזה — רק המספר)</span>
        </div>
        <Seg label="מי שמחוץ לגזרה" value={outside} options={OUTSIDE_LABELS} onChange={setOutside} />
      </section>

      {kind === "guess" && (
        <section className="f-card space-y-3">
          <h2 className="text-base font-bold">תוצאות אמת</h2>
          <p className="text-sm text-ink-soft">מה קרה בפועל. מוצג לצופים ליד התוצאות, עם סימון מי שצדק.</p>
          {editor.questions.map((q) => q.kind === "single" ? (
            <Seg key={q.id} label={q.title} value={String(truth[q.id] ?? "")} options={[["", "עוד לא ידוע"], ...q.options.map((o) => [o.id, o.label] as [string, string])]}
              onChange={(v) => { const t = { ...truth }; if (v) t[q.id] = v; else delete t[q.id]; setTruth(t); }} />
          ) : q.kind === "range" ? (
            <div key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label htmlFor={`truth-${q.id}`} className="text-sm font-bold min-w-[8.5rem]">{q.title}</label>
              <input id={`truth-${q.id}`} type="number" dir="ltr" min={q.min} max={q.max} step={q.step} className="w-24 rounded-xl border border-paper-line bg-paper px-3 py-2" value={truth[q.id] ?? ""}
                onChange={(e) => { const t = { ...truth }; if (e.target.value === "") delete t[q.id]; else t[q.id] = Number(e.target.value); setTruth(t); }} />
            </div>
          ) : null)}
        </section>
      )}

      <section className="f-card space-y-3">
        <h2 className="text-base font-bold">כותרת ושאלה</h2>
        <SurveyEditor value={editor} onChange={setEditor} />
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="f-btn pri" disabled={busy} onClick={() => void save()}>{busy ? "שומר…" : "שמירת השינויים"}</button>
        <button type="button" className="f-btn" onClick={onDone}>חזרה לסקר</button>
      </div>
      {msg && <p role="status" className="text-sm rounded-xl bg-accent-soft px-3 py-2">{msg}</p>}

      <section className="f-card space-y-2">
        <h2 className="text-base font-bold">הטמעה באתר אחר</h2>
        <p className="text-sm text-ink-soft">הסקר והתוצאות בחלון אחד. מי שמחובר עם Google באתר הגזרה — נכנס אוטומטית.</p>
        <pre dir="ltr" className="text-[11px] whitespace-pre-wrap break-all rounded-xl bg-[rgb(var(--grid))] p-2">{code}</pre>
        <button type="button" className="f-btn" onClick={() => { void navigator.clipboard?.writeText(code).then(() => setCopied(true)); }}>{copied ? "הועתק ✓" : "העתקת הקוד"}</button>
      </section>

      <button type="button" className="f-btn !text-warn" onClick={() => setDel(true)}>מחיקת הסקר</button>
      {del && (
        <ConfirmDialog title={`למחוק את "${survey.title}"?`} confirm="מחיקה" onConfirm={() => void remove()} onCancel={() => setDel(false)}>
          <p>הסקר וכל התשובות שנשמרו בו יימחקו. אי אפשר לשחזר.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** קוד ההטמעה של סקר: iframe ותסריט קצר להתאמת הגובה (כמו בשאר ההטמעות), עם הרשאת זהות לכניסה אחת */
export function surveyEmbedCode(id: string, title: string): string {
  return `<iframe src="${SITE_ORIGIN}/#/s/${id}?embed=1" title="${title}" style="width:100%;border:0;min-height:700px" loading="lazy" allow="identity-credentials-get" data-elections26></iframe>
<script>addEventListener("message",function(m){if(m.origin!=="${SITE_ORIGIN}"||!m.data||m.data.type!=="elections26:height")return;document.querySelectorAll("iframe[data-elections26]").forEach(function(f){if(f.contentWindow===m.source)f.style.height=m.data.height+"px"})});</script>`;
}

/** לפי זמן — במגירה, עם מתג גרף / טבלה (הכרעת בעלים 02.11.2026). הגרף כמו בשאר האתר: לפי שעה, קווי מדרגה וקו בסוף כל יום */
function StatsDrawer({ stats }: { stats: SurveyStats }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"graph" | "table">("graph");
  // שעות רצופות מהשעה הראשונה עם נתון ועד עכשיו (שעה בלי נתון = 0)
  const byHour = new Map(stats.hours.map((h) => [h.hour, h]));
  const buckets: SeriesBucket[] = [];
  if (stats.hours.length) {
    for (let t = Date.parse(stats.hours[0].hour + ":00:00Z"), end = Date.now(); t <= end; t += 36e5) buckets.push({ t: new Date(t).toISOString(), hourly: true });
  }
  const at = (b: SeriesBucket) => byHour.get(b.t.slice(0, 13));
  // קו מצטבר, כמו שאר הגרפים באתר (הכרעת בעלים 02.11.2026) — לא קפיצות לפי שעה
  const cum = (k: "views" | "saves") => { let t = 0; return buckets.map((b) => (t += at(b)?.[k] ?? 0)); };
  if (!stats.days.length && !stats.hours.length) return null;
  return (
    <CardDrawer title="לפי זמן" open={open} onOpenChange={setOpen} className="mt-1">
      <div className="f-seg fit sm mb-3" role="radiogroup" aria-label="תצוגה">
        <button type="button" aria-pressed={view === "graph"} onClick={() => setView("graph")}>גרף</button>
        <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>טבלה</button>
      </div>
      {view === "graph" ? (
        <div className="space-y-3">
          <div><div className="text-sm font-bold mb-1">שמירות — מצטבר</div><GroupSeriesChart buckets={buckets} points={cum("saves")} label="שמירות מצטברות" height={110} /></div>
          <div><div className="text-sm font-bold mb-1">כניסות — מצטבר</div><GroupSeriesChart buckets={buckets} points={cum("views")} label="כניסות מצטברות" height={110} /></div>
        </div>
      ) : (
        <table className="w-full text-sm tabular">
          <thead><tr className="text-ink-soft"><th className="text-start font-normal">יום</th><th className="font-normal">כניסות</th><th className="font-normal">שמירות</th></tr></thead>
          <tbody>{stats.days.map((d) => <tr key={d.day} className="border-t border-paper-line"><td dir="ltr" className="text-start py-1">{d.day.split("-").reverse().slice(0, 2).join(".")}</td><td className="text-center font-num">{d.views}</td><td className="text-center font-num">{d.saves}</td></tr>)}</tbody>
        </table>
      )}
    </CardDrawer>
  );
}
