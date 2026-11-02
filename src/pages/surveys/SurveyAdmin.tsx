import { useEffect, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
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
  const conversion = stats && stats.viewers ? Math.round((stats.savers / stats.viewers) * 100) : null;

  return (
    <div className="space-y-3.5">
      <section className="f-card space-y-3">
        <h2 className="text-base font-bold">סטטיסטיקות</h2>
        {statsFailed && <p className="text-sm text-ink-soft">הסטטיסטיקות אינן זמינות כרגע.</p>}
        {!stats && !statsFailed && <p className="text-sm text-ink-soft">טוען…</p>}
        {stats && <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="כניסות" value={stats.views} />
            <Tile label="צופים שונים" value={stats.viewers} />
            <Tile label="שמירות" value={stats.saves} />
            <Tile label="משתמשים ששמרו" value={stats.savers} />
            <Tile label="מתוך הטמעה" value={stats.embedViews} />
            <Tile label="שמרו — מהגזרה" value={stats.members} />
            <Tile label="שמרו — מחוץ לגזרה" value={stats.outsiders} />
            <Tile label="שינו תשובה" value={stats.changed} />
          </div>
          {conversion !== null && <p className="text-sm text-ink-soft">שמרו מתוך הצופים: <b className="font-num text-ink">{conversion}%</b></p>}
          {stats.days.length > 0 && (
            <table className="w-full text-sm tabular">
              <thead><tr className="text-ink-soft"><th className="text-start font-normal">יום</th><th className="font-normal">כניסות</th><th className="font-normal">שמירות</th></tr></thead>
              <tbody>{stats.days.slice(0, 7).map((d) => <tr key={d.day} className="border-t border-paper-line"><td dir="ltr" className="text-start py-1">{d.day.split("-").reverse().slice(0, 2).join(".")}</td><td className="text-center font-num">{d.views}</td><td className="text-center font-num">{d.saves}</td></tr>)}</tbody>
            </table>
          )}
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
