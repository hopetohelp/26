import type { VotePayload } from "../../lib/crowdApi";
import { validateVote } from "../../lib/crowdValidate";
import { ALPHA, EMPTY_VOTE, IDS, K25_IDS, K25_LISTS, K25_PASSED, V2022_LABEL, V2026_LABEL, k25VoteName } from "./model";
import SaveButton, { SaveError } from "./SaveButton";
import { ActionBar, Btn, StatusPill } from "./ui";
import Select from "../../components/Select";
import type { useSession, useUnit } from "./useCrowd";

export default function Vote({ unit, session }: { unit: ReturnType<typeof useUnit<VotePayload>>; session: ReturnType<typeof useSession> }) {
  const p = unit.draft ?? EMPTY_VOTE;
  const set = (patch: Partial<VotePayload>) => unit.setDraft({ ...p, ...patch });
  return (
    <div className="space-y-4">
      <div className="bg-accent-soft text-ink rounded-theme p-3 space-y-1">
        <p className="font-bold">ההצבעה הקודמת שלכם עוזרת להבין את התמונה</p>
        <p className="text-sm leading-relaxed">כדי להשוות את התפלגות העונים בסקר לתוצאות הבחירות בפועל, חשוב מאוד שהתשובה על הצבעתכם בבחירות הקודמות תהיה אמיתית. בחרו את הרשימה שהצבעתם לה אז, גם אם היום אתם בוחרים אחרת.</p>
      </div>
      <p className="text-sm text-ink-soft">שתי השאלות הן רשות. אפשר להשיב רק על אחת, והבחירה נשמרת בלחיצה על ״שמירה״ או ביציאה מהמסך.</p>
      <div className="grid md:grid-cols-2 gap-3 [&>*]:min-w-0">
        <section className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-2">
          <Select id="vote-2022" label="בבחירות 2022 הצבעתי ל…" value={p.v2022 ?? ""} onChange={v => set({ v2022: v || null })} hint="הרשימות בהרכבן בבחירות הקודמות, כולל רשימות שלא עברו את הסף.">
            <option value="">בחירת ההצבעה הקודמת</option>
            <optgroup label="רשימות שנכנסו לכנסת">
              {K25_PASSED.map(l => <option key={l.letters} value={l.letters}>{k25VoteName(l.letters)}</option>)}
            </optgroup>
            <optgroup label="רשימות שלא עברו את אחוז החסימה">
              {K25_LISTS.filter(l => l.seats === 0).map(l => <option key={l.letters} value={l.letters}>{l.short}</option>)}
            </optgroup>
            <optgroup label="אפשרויות נוספות">
              {Object.entries(V2022_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </optgroup>
          </Select>
        </section>
        <section className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-2">
          <Select id="vote-2026" label="בבחירות 2026 בכוונתי להצביע ל…" value={p.v2026 ?? ""} onChange={v => set({ v2026: v || null })} hint="אפשר גם לבחור ״עוד לא החלטתי״ ולעדכן בהמשך.">
            <option value="">בחירת כוונת ההצבעה</option>
            <optgroup label="הרשימות — לפי סדר האלף־בית">
              {ALPHA.map(l => <option key={l.id} value={l.id}>{l.id === "rzp" ? "הציונות הדתית/זהות" : l.name}</option>)}
            </optgroup>
            <optgroup label="אפשרויות נוספות">
              {Object.entries(V2026_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </optgroup>
          </Select>
        </section>
      </div>
      <details className="text-sm text-ink-soft border-b border-paper-line pb-2">
        <summary className="cursor-pointer min-h-[44px] py-3 font-bold">איך נשמרת הפרטיות?</summary>
        <div className="space-y-2 pb-2 leading-relaxed">
          <p>באתר מוצגים רק נתונים מצטברים, ללא שם המשתתף וללא שיוך של תשובה לאדם.</p>
          <p>התשובות האישיות נשמרות בחשבון שלכם כדי שתוכלו לחזור ולעדכן אותן. אין צורך למסור שם אמיתי או כתובת מייל.</p>
          <p>בקבוצות קטנות, גם נתונים מצטברים עשויים לאפשר הסקת תשובות אישיות.</p>
        </div>
      </details>
      <div><StatusPill status={unit.status} queued={unit.queued} /></div>
      <ActionBar above={unit.error && <div className="bg-paper-card rounded-theme"><SaveError unit={unit} /></div>}>
        <Btn disabled={!p.v2022 && !p.v2026} onClick={() => unit.setDraft(EMPTY_VOTE)}>אפס</Btn>
        <SaveButton unit={unit} session={session} invalid={validateVote(p, K25_IDS, IDS)} compact />
      </ActionBar>
    </div>
  );
}
