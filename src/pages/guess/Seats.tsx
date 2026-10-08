import PersonalBlocs from "../../components/PersonalBlocs";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import type { BlocsPayload, SeatCell, SeatsPayload } from "../../lib/crowdApi";
import { CROWD_URL } from "../../lib/crowdApi";
import { fillAll, fillErrorText, TOTAL } from "../../lib/fillAll";
import { seatsSum, validateBlocs, validateSeats } from "../../lib/crowdValidate";
import { dateLong } from "../../lib/format";
import { K25_MAP, k25Name, IDS, nameOf, POLL_RANGES, POLLS, POLLS_AS_OF, startSeats, THRESHOLD_SEATS } from "./model";
import { blocSummary } from "./blocSummary";
import { canSetSeats } from "./seatEditing";
import SaveButton, { SaveError, type SaveUnit } from "./SaveButton";
import SeatBoard from "./SeatBoard";
import Share from "./Share";
import { Btn, StatusPill } from "./ui";
import type { useSession, useUnit } from "./useCrowd";

const START_OPTIONS: { id: SeatsPayload["start"]; title: string; desc: string }[] = [
  { id: "zero", title: "מאפס", desc: "120 מושבים ריקים. אתם מחלקים הכול." },
  { id: "polls", title: "מממוצע הסקרים", desc: `הממוצע נכון ל-${dateLong(POLLS_AS_OF)}. משנים מה שרוצים.` },
  { id: "k25", title: "מתוצאות 2022", desc: `רק לרשימות שרצות שוב באותו הרכב (${Object.keys(K25_MAP).map(nameOf).join(", ")}). שאר הרשימות — ריקות, כי אין להן מקבילה אחת ב-2022.` },
];

export default function Seats({
  unit,
  session,
  blocsUnit,
  onStatistics,
}: {
  unit: ReturnType<typeof useUnit<SeatsPayload>>;
  session: ReturnType<typeof useSession>;
  blocsUnit: ReturnType<typeof useUnit<BlocsPayload>>;
  onStatistics: () => void;
}) {
  const p = unit.draft;
  const blocs = blocsUnit.draft;
  const [preview, setPreview] = useState<ReturnType<typeof fillAll> | null>(null);
  const [resetAsk, setResetAsk] = useState(false);
  const fillBtn = useRef<HTMLButtonElement>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const values = useMemo(() => Object.fromEntries(IDS.map((id) => [id, p?.seats[id]?.v ?? 0])), [p]);

  if (!p) {
    return (
      <div>
        <h2 className="font-display text-4xl leading-none mb-1">מאיפה מתחילים?</h2>
        <p className="text-ink-soft text-sm mb-4">בונים כנסת של 120. בוחרים נקודת פתיחה, ומשם כל מנדט בידיים שלכם.</p>
        <div className="grid sm:grid-cols-3 gap-3 [&>*]:min-w-0">
          {START_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => unit.setDraft(startSeats(o.id))}
              className="text-start bg-paper-card border-2 border-paper-line hover:border-ink rounded-theme p-4 min-h-[44px]"
            >
              <span className="font-display text-3xl leading-none block mb-1">{o.title}</span>
              <span className="text-sm text-ink-soft leading-relaxed block">{o.desc}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 opacity-80">
          <SeatBoard values={{}} />
        </div>
      </div>
    );
  }

  const sum = seatsSum(p);
  const left = TOTAL - sum;
  const invalid = validateSeats(p, IDS);
  // שמירה אחת למנדטים ולכל חלוקת גושים שנערכה, גם בלי יעד מספרי.
  const blocsToSave = !!blocs;
  const blocsInvalid = blocsToSave ? validateBlocs(blocs!, IDS) : null;
  const both: SaveUnit = {
    status: unit.status !== "saved" ? unit.status : blocsToSave && blocsUnit.status !== "saved" ? blocsUnit.status : "saved",
    state: unit.state === "saving" || blocsUnit.state === "saving" ? "saving" : unit.state === "error" || blocsUnit.state === "error" ? "error" : "idle",
    error: unit.error ?? blocsUnit.error,
    errorLog: unit.error ? unit.errorLog : blocsUnit.errorLog,
    save: async (token) => {
      const a = unit.status === "saved" ? true : await unit.save(token);
      const b = !a || !blocsToSave || blocsUnit.status === "saved" ? a : await blocsUnit.save(token);
      return a && b;
    },
  };
  const setCell = (id: string, c: SeatCell) => {
    setEditError(null);
    const { pct: _pct, calculation: _calculation, ...rest } = p;
    const base = c.v === p.seats[id]?.v ? p : { ...rest, mode: "seats" as const };
    unit.setDraft({ ...base, seats: { ...p.seats, [id]: c } });
    setPreview(null);
  };
  const setV = (id: string, v: number) => {
    const value = Math.max(0, Math.min(TOTAL, Math.round(v) || 0));
    if (!canSetSeats(p.seats, IDS, id, value)) {
      setEditError("אי אפשר להוסיף מעל 120 בלי להשאיר מפלגה אחרת פתוחה. פתחו נעילה של מפלגה אחרת או הפחיתו מנדטים.");
      return;
    }
    setCell(id, { v: value, src: "manual", locked: true });
  };
  const targets = blocs?.blocs.filter((b) => b.target !== null) ?? [];
  const runFill = () => setPreview(fillAll(IDS, p.seats, POLLS, blocs?.blocs ?? [], POLL_RANGES));
  const apply = () => {
    if (preview?.ok) { const { pct: _pct, calculation: _calculation, ...rest } = p; unit.setDraft({ ...rest, mode: "seats", seats: preview.seats, pollsAsOf: POLLS_AS_OF }); }
    setEditError(null);
    setPreview(null);
  };
  const rows = IDS;

  return (
    <div>
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5 [&>*]:min-w-0 items-start">
        <div className="lg:sticky lg:top-4 space-y-3">
          <SeatBoard values={values} />
          <PersonalBlocs values={values} source="חלוקת המנדטים בהשערה שלכם וצפי לכל גוש" asOf="הטיוטה הנוכחית" editTargets />
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={both.status} />
            <span className="text-xs text-ink-soft">
              נקודת פתיחה: {START_OPTIONS.find((o) => o.id === p.start)?.title}
              {p.pollsAsOf ? ` · ממוצע הסקרים מ-${dateLong(p.pollsAsOf)}` : ""}
            </span>
          </div>
          {justSaved && both.status === "saved" && (
            <div role="status" className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold">נשמר.</p>
              <Btn kind="primary" onClick={onStatistics}>מעבר לסטטיסטיקות</Btn>
            </div>
          )}
          {sum === TOTAL && !invalid && <Share values={values} pct={p.mode === "pct" ? p.pct : undefined} username={session.me?.username} blocs={blocSummary(blocs, values)} open={justSaved} />}
        </div>

        <div>
          {p.mode === "pct" && <p className="text-sm mb-3">המנדטים חושבו במחשבון. <Link to="/guess?section=calculator">עריכת קלט המחשבון</Link>. שינוי מנדטים כאן הופך את ההשערה לחלוקה ישירה.</p>}
          <LockLegend />
            {targets.length > 0 && <p className="text-sm text-ink mb-2">"השלם הכול" מתחשב גם ביעדי הגושים שלכם ({targets.map((b) => `${b.name}: ${b.target}`).join(", ")}).</p>}
            <ul className="divide-y divide-paper-line border-y border-paper-line" aria-label="מנדטים לכל רשימה">
              {rows.map((id) => {
                const c = p.seats[id] ?? { v: 0, src: "manual", locked: false };
                const under = c.v > 0 && c.v < THRESHOLD_SEATS;
                const name = nameOf(id);
                return (
                  <li key={id} className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold block truncate">{name}</span>
                        <span className="text-sm text-ink">
                          {rowState(c)}
                          {K25_MAP[id] && p.start === "k25" ? ` · 2022: ${k25Name(K25_MAP[id])}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1" dir="ltr">
                        <button type="button" aria-label={`פחות ל${name}`} disabled={c.v <= 0} onClick={() => setV(id, c.v - 1)} className="w-11 h-11 rounded-full border-2 border-ink text-2xl font-bold leading-none disabled:opacity-30 active:bg-ink active:text-paper-card">
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={TOTAL}
                          aria-label={`מנדטים ל${name}`}
                          value={c.v}
                          onChange={(e) => setV(id, Number(e.target.value))}
                          className="w-14 h-11 text-center font-num tabular text-2xl bg-paper text-ink rounded-theme border border-paper-line [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          style={{ textAlign: "center" }}
                        />
                        <button type="button" aria-label={`עוד ל${name}`} disabled={c.v >= TOTAL || !canSetSeats(p.seats, IDS, id, c.v + 1)} onClick={() => setV(id, c.v + 1)} className="w-11 h-11 rounded-full border-2 border-ink bg-ink text-paper-card text-2xl font-bold leading-none disabled:opacity-30">
                          +
                        </button>
                      </div>
                      <LockToggle name={name} locked={c.locked} onToggle={() => setCell(id, { ...c, locked: !c.locked, src: c.locked ? c.src : "manual" })} />
                    </div>
                    {under && (
                      <p className="text-xs text-warn mt-1">
                        אי אפשר לשמור עם {c.v} {c.v === 1 ? "מנדט" : "מנדטים"}. קבעו 0 למפלגה שלא עוברת את אחוז החסימה, או לפחות {THRESHOLD_SEATS} למפלגה שעוברת.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
      {/* פס פעולה דביק באזור האגודל */}
      <div className="sticky z-20 bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-4 mt-5">
        {(left < 0 || editError) && <p role="alert" className="mb-2 rounded-theme border-2 border-warn bg-paper-card text-ink p-3 text-sm font-bold">
          {editError ?? `יש כרגע ${sum} מנדטים — ${-left} מעל 120. הפחיתו מנדטים או השתמשו ב״השלם הכול״ למפלגות הפתוחות. אפשר לשמור רק כשהסכום חוזר ל־120.`}
        </p>}
        {preview && (
          <FillPreview
            preview={preview}
            current={p.seats}
            onApply={apply}
            onClose={() => setPreview(null)}
            returnTo={fillBtn}
          />
        )}
        <div className="bg-paper-card border-2 border-ink rounded-theme shadow-lg px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <div className="min-w-0" aria-live="polite">
              <span className="text-xs text-ink-soft block leading-none">{left >= 0 ? "נותרו לחלוקה" : "יותר מדי"}</span>
              <span className={`font-num tabular text-3xl leading-none ${left < 0 ? "text-warn" : ""}`}>{Math.abs(left)}</span>
            </div>
          <div className={`flex justify-center items-center gap-2 flex-wrap ${resetAsk ? "col-span-3 row-start-2" : ""}`}>
            {!resetAsk ? (
              <Btn onClick={() => setResetAsk(true)}>אפס הכול</Btn>
            ) : (
              <>
                <span className="text-sm self-center">הטיוטה תימחק. בטוח?</span>
                <Btn kind="danger" onClick={() => (unit.setDraft(null), setEditError(null), setResetAsk(false))}>
                  כן, מחדש
                </Btn>
                <Btn onClick={() => setResetAsk(false)}>לא</Btn>
              </>
            )}
          </div>
          <div className="flex justify-end items-center gap-2 flex-wrap">
          <button
            ref={fillBtn}
            type="button"
            onClick={runFill}
            aria-haspopup="dialog"
            aria-expanded={!!preview}
            className="min-h-[44px] px-2 sm:px-4 whitespace-nowrap rounded-full border-2 text-sm font-bold bg-paper-card text-ink border-paper-line hover:border-ink-faint"
          >
            השלם הכול
          </button>
          <SaveButton unit={both} session={session} invalid={invalid ?? blocsInvalid} compact onSaved={() => setJustSaved(true)} />
          </div>
        </div>
        <SaveError unit={both} />
        {invalid && left >= 0 && <p role="status" className="mt-2 text-sm text-warn">{invalid}</p>}
        {!CROWD_URL && <p className="sr-only">השמירה עוד לא פעילה באתר.</p>}
      </div>

        </div>
      </div>


    </div>
  );
}

/** מה כתוב בשורה (הכפתור שלידה כבר אומר נעול/פתוח): הערך שלכם · הושלם אוטומטית · טרם נקבע */
const rowState = (c: SeatCell) => (c.locked ? "הערך שלכם" : c.src === "filled" ? "הושלם אוטומטית" : "טרם נקבע");

/** כפתור נעילה עם מילה — לא רק אייקון: נעול = מלא וכהה, פתוח = ריק עם קו מקווקו */
function LockChip({ locked }: { locked: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border-2 text-sm font-bold ${locked ? "bg-ink text-paper-card border-ink" : "bg-paper-card text-ink border-dashed border-ink-soft"}`}>
      <Lock on={locked} />
      {locked ? "נעול" : "פתוח"}
    </span>
  );
}
function LockToggle({ name, locked, onToggle }: { name: string; locked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={locked}
      aria-label={locked ? `${name}: נעול. לחיצה פותחת לשינוי ב"השלם הכול"` : `${name}: פתוח. לחיצה נועלת`}
      onClick={onToggle}
      className="shrink-0 rounded-full"
    >
      <LockChip locked={locked} />
    </button>
  );
}
/** הסבר קבוע על ההבדל בין נעול לפתוח, עם אותם כפתורים כמו בשורות */
function LockLegend() {
  return (
    <div className="mb-3 rounded-theme border border-paper-line bg-paper-card p-3 space-y-2" aria-label="מה ההבדל בין נעול לפתוח">
      <p className="text-sm font-bold">מה זה נעול ומה זה פתוח?</p>
      <p className="flex items-center gap-3 text-sm text-ink">
        <span className="shrink-0" aria-hidden="true"><LockChip locked /></span>
        <span>המספר שלכם. "השלם הכול" לא ישנה אותו. כל ערך שתקלידו ננעל מעצמו.</span>
      </p>
      <p className="flex items-center gap-3 text-sm text-ink">
        <span className="shrink-0" aria-hidden="true"><LockChip locked={false} /></span>
        <span>"השלם הכול" רשאי לשנות אותו כדי שהסכום יגיע ל-120. לחיצה על הכפתור שבשורה נועלת או פותחת.</span>
      </p>
    </div>
  );
}

function Lock({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      {on ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2" />}
    </svg>
  );
}

/**
 * תצוגה מקדימה של "השלם הכול" — חלונית שמוצמדת לפס הפעולה: בטלפון גיליון ברוחב מלא מעל הפס, במחשב חלונית צמודה לפס.
 * המיקוד עובר אליה, Esc סוגר, והמיקוד חוזר לכפתור. בלי window.confirm.
 */
function FillPreview({
  preview,
  current,
  onApply,
  onClose,
  returnTo,
}: {
  preview: ReturnType<typeof fillAll>;
  current: SeatsPayload["seats"];
  onApply: () => void;
  onClose: () => void;
  returnTo: RefObject<HTMLButtonElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const back = returnTo.current;
    return () => back?.focus();
  }, [returnTo]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="fill-preview-title"
      onKeyDown={onKey}
      className="absolute bottom-full mb-2 inset-x-0 md:start-auto md:w-[28rem] max-h-[min(60vh,32rem)] overflow-y-auto bg-paper-card text-ink border-2 border-ink rounded-theme shadow-lg p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      {preview.ok ? (
        <>
          <h3 id="fill-preview-title" className="font-display text-3xl leading-none mb-2">
            כך זה ייראה
          </h3>
          {preview.changed.length === 0 ? (
            <p className="text-sm mb-3">אין מה להשלים — הכול כבר קבוע.</p>
          ) : (
            <ul className="text-sm grid grid-cols-1 gap-y-1 mb-3">
              {preview.changed.map((id) => (
                <li key={id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{nameOf(id)}</span>
                  <bdi dir="ltr" className="tabular font-bold shrink-0">
                    {current[id]?.v ?? 0} → {preview.seats[id].v}
                  </bdi>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-soft mb-3">לפי חלק כל רשימה בממוצע הסקרים מ-{dateLong(POLLS_AS_OF)}; רשימה שבממוצע מתחת לסף מקבלת 0. נעולים לא זזו.</p>
          <div className="flex gap-2">
            <Btn kind="primary" onClick={onApply}>
              להחיל
            </Btn>
            <Btn onClick={onClose}>ביטול</Btn>
          </div>
        </>
      ) : (
        <>
          <h3 id="fill-preview-title" className="font-display text-3xl leading-none mb-2">
            אי אפשר להשלים
          </h3>
          <p role="alert" className="text-sm text-warn font-bold mb-2">
            {fillErrorText(preview.error)}
          </p>
          <Btn onClick={onClose}>הבנתי</Btn>
        </>
      )}
    </div>
  );
}
