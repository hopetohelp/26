import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { slugFromName } from "../../../worker/crowd/lib/slug.js";
import ConfirmDialog from "../../components/ConfirmDialog";
import GoogleButton from "../guess/GoogleButton";
import { useSession } from "../guess/useCrowd";
import { call } from "../../lib/crowdApi";
import { results2026 } from "../../lib/guessAccuracyData";
import { lists2026 } from "../../lib/data";
import { listSurveys, OUTSIDE_LABELS, type Survey, type SurveyOption, type SurveyOutside, type SurveyQuestion } from "../../lib/surveys";

type Status = Survey["status"];
const STATUS: [Status, string][] = [["draft", "טיוטה"], ["open", "פתוח"], ["closed", "נסגר"]];
const COLUMNS: SurveyOption[] = [{ id: "coalition", label: "קואליציה" }, { id: "abstain", label: "נמנעים" }, { id: "opposition", label: "אופוזיציה" }];
/** הרשימות שנכנסו לכנסת — לשאלת שיוך חדשה (המנדטים נקראים במסך הסקר מתוצאות האמת, מקור אחד) */
const knessetLists = (): SurveyOption[] => lists2026.filter((l) => (results2026.seats[l.id] ?? 0) > 0).map((l) => ({ id: l.id, label: l.name, seats: results2026.seats[l.id] }));
const slug = (n: number) => `q${n}`;

interface Draft { id: string; title: string; status: Status; outside: SurveyOutside; questions: SurveyQuestion[]; isNew: boolean; idTouched?: boolean }
const empty = (): Draft => ({ id: "", title: "", status: "draft", outside: "none", questions: [], isNew: true });
/** מזהה לטיני אוטומטי מהכותרת — אותו תעתיק כמו שמות הקבוצות (worker/crowd/lib/slug.js); המנהל יכול לשנות */
const autoId = (title: string) => (slugFromName(title) ?? "").replace(/-group$/, "").slice(0, 40);

/**
 * ניהול סקרים למנהלי הגזרה (הכרעת בעלים 01.11.2026: שליטה מלאה — יצירה, עריכה, פתיחה/סגירה, גישה מחוץ לגזרה ומחיקה).
 * בשלב הראשון בלי קישור מאף מסך; הכתובת: #/surveys/manage.
 */
export default function SurveyManageScreen() {
  const session = useSession();
  const { token, me } = session;
  const groups = me?.managedGroups ?? [];
  const group = groups[0]?.id ?? "";
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [del, setDel] = useState(false);

  const load = useCallback(() => { listSurveys(token).then((r) => setSurveys(r.surveys.filter((s) => s.manage))).catch(() => setMsg("רשימת הסקרים אינה זמינה כרגע.")); }, [token]);
  useEffect(load, [load]);
  // פתיחה ישירה לעריכה ממגירת הניהול שבמסך הסקר: ?edit=<מזהה>
  const [params, setParams] = useSearchParams();
  const editId = params.get("edit");
  useEffect(() => {
    const s = editId && surveys?.find((x) => x.id === editId);
    if (s) { setDraft({ id: s.id, title: s.title, status: s.status, outside: s.outside ?? "none", questions: s.questions, isNew: false }); setParams({}, { replace: true }); }
  }, [editId, surveys, setParams]);

  if (!token) return <main className="px-4 md:px-6 pb-28 space-y-3 md:max-w-3xl md:mx-auto"><h1 className="text-[26px] font-display pt-1">ניהול סקרים</h1><p>כניסה עם Google:</p><GoogleButton session={session} onDone={() => void session.refresh()} /></main>;
  if (me && !groups.length) return <main className="px-4 md:px-6 pb-28 md:max-w-3xl md:mx-auto"><h1 className="text-[26px] font-display pt-1">ניהול סקרים</h1><p className="text-ink-soft">המסך הזה למנהלי קבוצה בלבד.</p></main>;

  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const setQ = (i: number, q: SurveyQuestion) => draft && set({ questions: draft.questions.map((x, j) => (j === i ? q : x)) });

  async function save() {
    if (!draft) return;
    setMsg(null);
    const body = { group, id: draft.id.trim(), status: draft.status, outside: draft.outside, def: { title: draft.title.trim(), questions: draft.questions } };
    try { await call("/survey/manage", { token, body }); setMsg("נשמר ✓"); setDraft(null); load(); }
    catch (e) { setMsg(`השמירה לא הצליחה (${(e as { code?: string }).code ?? "שגיאה"}). בדקו שלכל שאלה כותרת ולפחות שתי אפשרויות, ושמזהה הסקר באותיות לטיניות.`); }
  }
  async function remove() {
    if (!draft) return;
    try { await call("/survey/manage", { token, body: { group, id: draft.id, delete: true, confirm: "מחק" } }); setDel(false); setDraft(null); setMsg("הסקר נמחק."); load(); }
    catch { setMsg("המחיקה לא הצליחה."); }
  }

  return (
    <main className="px-4 md:px-6 pb-28 space-y-3.5 md:max-w-3xl md:mx-auto">
      <h1 className="text-[26px] font-display pt-1">ניהול סקרים</h1>
      {msg && <p role="status" className="text-sm rounded-xl bg-accent-soft px-3 py-2">{msg}</p>}

      {!draft && <>
        <button type="button" className="f-btn pri" onClick={() => setDraft(empty())}>סקר חדש</button>
        <ul className="f-card !p-0 divide-y divide-paper-line">
          {(surveys ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 min-w-0"><b className="block">{s.title}</b><span className="text-[12.5px] text-ink-soft">{STATUS.find((x) => x[0] === s.status)?.[1]} · מחוץ לגזרה: {OUTSIDE_LABELS.find((x) => x[0] === (s.outside ?? "none"))?.[1]}</span></span>
              <Link to={`/s/${s.id}`} className="text-sm text-accent">לסקר</Link>
              <button type="button" className="f-btn" onClick={() => setDraft({ id: s.id, title: s.title, status: s.status, outside: s.outside ?? "none", questions: s.questions, isNew: false })}>עריכה</button>
            </li>
          ))}
          {surveys && !surveys.length && <li className="px-4 py-3 text-ink-soft">אין עדיין סקרים.</li>}
        </ul>
      </>}

      {draft && (
        <section className="f-card space-y-3">
          <label className="block"><span className="text-sm font-bold">כותרת</span>
            <input className="mt-1 w-full rounded-xl border border-paper-line bg-paper px-3 py-2" value={draft.title} onChange={(e) => set({ title: e.target.value, ...(draft.isNew && !draft.idTouched ? { id: autoId(e.target.value) } : {}) })} /></label>
          {draft.isNew && <label className="block"><span className="text-sm font-bold">מזהה לכתובת</span>
            <input dir="ltr" className="mt-1 w-full rounded-xl border border-paper-line bg-paper px-3 py-2" value={draft.id} onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""), idTouched: true })} placeholder="נוצר אוטומטית מהכותרת" />
            <span className="text-xs text-ink-soft">נוצר אוטומטית מהכותרת; אפשר לשנות. הכתובת: 26.hopetohelp.net/#/s/{draft.id || "…"}</span></label>}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold">מצב:</span>
            <div className="f-seg sm" role="radiogroup" aria-label="מצב">{STATUS.map(([k, l]) => <button key={k} type="button" aria-pressed={draft.status === k} onClick={() => set({ status: k })}>{l}</button>)}</div>
            <span className="text-sm font-bold">מחוץ לגזרה:</span>
            <div className="f-seg sm" role="radiogroup" aria-label="גישה מחוץ לגזרה">{OUTSIDE_LABELS.map(([k, l]) => <button key={k} type="button" aria-pressed={draft.outside === k} onClick={() => set({ outside: k })}>{l}</button>)}</div>
          </div>

          {draft.questions.map((q, i) => (
            <div key={i} className="border-t border-paper-line pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <b className="text-sm">שאלה {i + 1} · {q.kind === "single" ? "בחירה אחת" : "שיוך רשימות לקואליציה / נמנעים / אופוזיציה"}</b>
                <span className="flex-1" />
                <button type="button" className="text-sm text-warn" onClick={() => set({ questions: draft.questions.filter((_, j) => j !== i) })}>הסרה</button>
              </div>
              <input className="w-full rounded-xl border border-paper-line bg-paper px-3 py-2" placeholder="נוסח השאלה" value={q.title} onChange={(e) => setQ(i, { ...q, title: e.target.value })} />
              {q.kind === "single" && (
                <label className="block"><span className="text-xs text-ink-soft">אפשרויות — אחת בכל שורה</span>
                  <textarea rows={3} className="mt-1 w-full rounded-xl border border-paper-line bg-paper px-3 py-2" value={q.options.map((o) => o.label).join("\n")}
                    onChange={(e) => setQ(i, { ...q, options: e.target.value.split("\n").map((label, k) => ({ id: q.options[k]?.id ?? `o${k + 1}`, label })) })} /></label>
              )}
              {q.kind === "assign" && <p className="text-xs text-ink-soft">{q.items.length} רשימות; המנדטים במסך הסקר — מתוצאות האמת באתר.</p>}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="f-btn" onClick={() => set({ questions: [...draft.questions, { id: slug(draft.questions.length + 1), kind: "single", title: "", options: [{ id: "yes", label: "כן" }, { id: "no", label: "לא" }] }] })}>+ שאלת בחירה</button>
            <button type="button" className="f-btn" onClick={() => set({ questions: [...draft.questions, { id: slug(draft.questions.length + 1), kind: "assign", title: "מי בקואליציה, מי נמנע ומי באופוזיציה?", items: knessetLists(), columns: COLUMNS }] })}>+ שאלת שיוך רשימות</button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-paper-line pt-3">
            <button type="button" className="f-btn pri" onClick={() => void save()}>שמירה</button>
            <button type="button" className="f-btn" onClick={() => { setDraft(null); setMsg(null); }}>ביטול</button>
            {!draft.isNew && <button type="button" className="f-btn !text-warn" onClick={() => setDel(true)}>מחיקת הסקר</button>}
          </div>
        </section>
      )}
      {del && draft && (
        <ConfirmDialog title={`למחוק את "${draft.title}"?`} confirm="מחיקה" onConfirm={() => void remove()} onCancel={() => setDel(false)}>
          <p>הסקר וכל התשובות שנשמרו בו יימחקו. אי אפשר לשחזר.</p>
        </ConfirmDialog>
      )}
    </main>
  );
}
