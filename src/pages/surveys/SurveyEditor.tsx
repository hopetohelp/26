import { slugFromName } from "../../../worker/crowd/lib/slug.js";
import type { SurveyQuestion } from "../../lib/surveys";

/** כותרת ושאלות בעריכה. בסקר חדש: רשימת אפשרויות או בחירה מטווח (הכרעת בעלים 01.11.2026; שיוך רשימות — רק בסקר שכבר קיים) */
export interface EditorValue { id: string; title: string; questions: SurveyQuestion[]; isNew: boolean; idTouched?: boolean }
/** מזהה לטיני אוטומטי מהכותרת — אותו תעתיק כמו שמות הקבוצות (worker/crowd/lib/slug.js); המנהל יכול לשנות */
export const autoId = (title: string) => (slugFromName(title) ?? "").replace(/-group$/, "").slice(0, 40);
const input = "w-full rounded-xl border border-paper-line bg-paper px-3 py-2";

export default function SurveyEditor({ value, onChange }: { value: EditorValue; onChange: (v: EditorValue) => void }) {
  const set = (patch: Partial<EditorValue>) => onChange({ ...value, ...patch });
  const setQ = (i: number, q: SurveyQuestion) => set({ questions: value.questions.map((x, j) => (j === i ? q : x)) });
  const nextId = () => { let n = value.questions.length + 1; while (value.questions.some((q) => q.id === `q${n}`)) n++; return `q${n}`; };
  return (
    <div className="space-y-3">
      <label className="block"><span className="text-sm font-bold">כותרת</span>
        <input className={`mt-1 ${input}`} value={value.title} onChange={(e) => set({ title: e.target.value, ...(value.isNew && !value.idTouched ? { id: autoId(e.target.value) } : {}) })} /></label>
      {value.isNew && (
        <label className="block"><span className="text-sm font-bold">מזהה לכתובת</span>
          <input dir="ltr" className={`mt-1 ${input}`} value={value.id} placeholder="נוצר אוטומטית מהכותרת" onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""), idTouched: true })} />
          <span className="text-xs text-ink-soft">נוצר אוטומטית מהכותרת; אפשר לשנות. הכתובת: 26.hopetohelp.net/#/s/{value.id || "…"}</span></label>
      )}
      {value.questions.map((q, i) => (
        <div key={i} className="border-t border-paper-line pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <b className="text-sm flex-1">שאלה {i + 1} · {q.kind === "single" ? "רשימת אפשרויות" : q.kind === "range" ? "בחירה מטווח" : "שיוך רשימות (קיים)"}</b>
            <button type="button" className="f-btn !min-h-[36px] !text-warn" onClick={() => set({ questions: value.questions.filter((_, j) => j !== i) })}>הסרה</button>
          </div>
          <input className={input} placeholder="נוסח השאלה" value={q.title} onChange={(e) => setQ(i, { ...q, title: e.target.value })} />
          {q.kind === "single" && (
            <label className="block"><span className="text-xs text-ink-soft">אפשרויות — אחת בכל שורה</span>
              <textarea rows={3} className={`mt-1 ${input}`} value={q.options.map((o) => o.label).join("\n")}
                onChange={(e) => setQ(i, { ...q, options: e.target.value.split("\n").map((label, k) => ({ id: q.options[k]?.id ?? `o${k + 1}`, label })) })} /></label>
          )}
          {q.kind === "range" && (
            <div className="grid grid-cols-3 gap-2">
              {(["min", "max", "step"] as const).map((k) => (
                <label key={k} className="block"><span className="text-xs text-ink-soft">{k === "min" ? "מ־" : k === "max" ? "עד" : "קפיצה"}</span>
                  <input type="number" dir="ltr" className={`mt-1 ${input}`} value={q[k]} onChange={(e) => setQ(i, { ...q, [k]: Number(e.target.value) })} /></label>
              ))}
              <label className="block col-span-3 sm:col-span-1"><span className="text-xs text-ink-soft">תווית לקצה הנמוך</span>
                <input className={`mt-1 ${input}`} value={q.minLabel ?? ""} onChange={(e) => setQ(i, { ...q, minLabel: e.target.value })} /></label>
              <label className="block col-span-3 sm:col-span-1"><span className="text-xs text-ink-soft">תווית לקצה הגבוה</span>
                <input className={`mt-1 ${input}`} value={q.maxLabel ?? ""} onChange={(e) => setQ(i, { ...q, maxLabel: e.target.value })} /></label>
            </div>
          )}
          {q.kind === "assign" && <p className="text-xs text-ink-soft">{q.items.length} רשימות; המנדטים במסך הסקר — מתוצאות האמת באתר.</p>}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="f-btn" onClick={() => set({ questions: [...value.questions, { id: nextId(), kind: "single", title: "", options: [{ id: "yes", label: "כן" }, { id: "no", label: "לא" }] }] })}>+ רשימת אפשרויות</button>
        <button type="button" className="f-btn" onClick={() => set({ questions: [...value.questions, { id: nextId(), kind: "range", title: "", min: 1, max: 10, step: 1 }] })}>+ בחירה מטווח</button>
      </div>
    </div>
  );
}
