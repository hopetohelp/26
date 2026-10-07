import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Explained from "../../components/Explained";
import type { BlocsPayload, SeatCell, SeatsPayload } from "../../lib/crowdApi";
import { CROWD_URL } from "../../lib/crowdApi";
import { fillAll, fillErrorText, fillPct, pctFillErrorText, TOTAL, type PctFillResult } from "../../lib/fillAll";
import { seatsSum, validateBlocs, validatePct, validateSeats } from "../../lib/crowdValidate";
import { dateLong } from "../../lib/format";
import { seatsFromPct, THRESHOLD_PCT, type PctSeats } from "../../lib/lawSeats";
import { K25_MAP, k25Name, IDS, nameOf, POLL_SHARES, POLLS, POLLS_AS_OF, startSeats, THRESHOLD_SEATS } from "./model";
import Blocs from "./Blocs";
import { blocSummary } from "./blocSummary";
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

const r1 = (x: number) => Math.round(x * 10) / 10;

/** מצב אחוזים: האחוזים ⇐ מנדטים לפי החוק. המנעול והמקור של כל אחוז נשמרים בתא המנדטים של אותה רשימה. */
function withPct(p: SeatsPayload, pct: Record<string, number>, flags?: Record<string, Pick<SeatCell, "src" | "locked">>): { next: SeatsPayload; law: PctSeats | null } {
  const law = seatsFromPct(IDS, pct);
  const ok = law && law.r.status === "ok";
  const seats: Record<string, SeatCell> = {};
  for (const id of IDS) {
    const prev = p.seats[id] ?? { v: 0, src: "manual", locked: false };
    const f = flags?.[id] ?? prev;
    seats[id] = { v: ok ? (law.r.seats[id] ?? 0) : prev.v, src: f.src, locked: f.locked };
  }
  return { next: { ...p, mode: "pct", pct, seats }, law };
}

/** פתיחת מצב אחוזים: מנקודת הפתיחה "מממוצע הסקרים" — ממוצע הסקרים באחוזים; אחרת — אפס */
function initialPct(p: SeatsPayload): Record<string, number> {
  if (p.pct) return p.pct;
  return Object.fromEntries(IDS.map((id) => [id, p.start === "polls" ? r1(POLL_SHARES[id] ?? 0) : 0]));
}

export default function Seats({
  unit,
  session,
  blocsUnit,
  crowd,
}: {
  unit: ReturnType<typeof useUnit<SeatsPayload>>;
  session: ReturnType<typeof useSession>;
  blocsUnit: ReturnType<typeof useUnit<BlocsPayload>>;
  crowd: Record<string, number> | null;
}) {
  const p = unit.draft;
  const blocs = blocsUnit.draft;
  const [preview, setPreview] = useState<ReturnType<typeof fillAll> | null>(null);
  const [resetAsk, setResetAsk] = useState(false);
  const fillBtn = useRef<HTMLButtonElement>(null);
  const [pctPreview, setPctPreview] = useState<PctFillResult | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const values = useMemo(() => Object.fromEntries(IDS.map((id) => [id, p?.seats[id]?.v ?? 0])), [p]);
  const pctMode = p?.mode === "pct";
  const law = useMemo(() => (p?.mode === "pct" && p.pct ? seatsFromPct(IDS, p.pct) : null), [p]);

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
  const pct = p.pct ?? {};
  const pctSum = r1(IDS.reduce((a, id) => a + (pct[id] || 0), 0));
  const pctLeft = r1(100 - pctSum);
  const lawProblem = !pctMode
    ? null
    : !law
      ? `סכום האחוזים ${pctSum}%, יותר מ-100%.`
      : law.r.status === "lottery_required"
        ? "יצא שוויון מדויק בין מנות — לפי החוק מכריעה הגרלה. כדאי לשנות אחוז אחד בעשירית."
        : law.r.status !== "ok"
          ? "אי אפשר לחשב: צריך לפחות רשימה אחת מעל אחוז החסימה."
          : null;
  const invalid = pctMode ? (validatePct(pct, IDS) ?? lawProblem ?? validateSeats(p, IDS)) : validateSeats(p, IDS);
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
    unit.setDraft({ ...p, seats: { ...p.seats, [id]: c } });
    setPreview(null);
  };
  const setV = (id: string, v: number) => setCell(id, { v: Math.max(0, Math.min(TOTAL, Math.round(v) || 0)), src: "manual", locked: true });
  const setPct = (id: string, v: number) => {
    const next = { ...pct, [id]: Math.max(0, Math.min(100, r1(Number.isFinite(v) ? v : 0))) };
    unit.setDraft(withPct(p, next, { ...p.seats, [id]: { src: "manual", locked: true } as SeatCell }).next);
    setPctPreview(null);
  };
  const setMode = (m: "seats" | "pct") => {
    setPreview(null);
    setPctPreview(null);
    if (m === "pct") return unit.setDraft(withPct(p, initialPct(p)).next);
    // חזרה למנדטים: המנדטים שחישב המנוע נשארים, האחוזים יורדים
    const { pct: _drop, ...rest } = p;
    void _drop;
    unit.setDraft({ ...rest, mode: "seats" });
  };
  const targets = blocs?.blocs.filter((b) => b.target !== null) ?? [];
  const runFill = () =>
    pctMode ? setPctPreview(fillPct(IDS, pct, (id) => !!p.seats[id]?.locked, POLL_SHARES)) : setPreview(fillAll(IDS, p.seats, POLLS, blocs?.blocs ?? []));
  const apply = () => {
    if (preview?.ok) unit.setDraft({ ...p, seats: preview.seats, pollsAsOf: POLLS_AS_OF });
    setPreview(null);
  };
  const applyPct = () => {
    if (pctPreview?.ok) {
      const flags = Object.fromEntries(IDS.map((id) => [id, p.seats[id]?.locked ? p.seats[id] : { src: "filled" as const, locked: false }]));
      unit.setDraft({ ...withPct(p, pctPreview.pct, flags).next, pollsAsOf: POLLS_AS_OF });
    }
    setPctPreview(null);
  };
  const rows = IDS;

  return (
    <div>
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5 [&>*]:min-w-0 items-start">
        <div className="lg:sticky lg:top-4 space-y-3">
          <SeatBoard values={values} />
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={both.status} />
            <span className="text-xs text-ink-soft">
              נקודת פתיחה: {START_OPTIONS.find((o) => o.id === p.start)?.title}
              {p.pollsAsOf ? ` · ממוצע הסקרים מ-${dateLong(p.pollsAsOf)}` : ""}
            </span>
          </div>
          {justSaved && both.status === "saved" && (
            <p role="status" className="text-sm font-bold">
              נשמר. עכשיו — שתפו, ותראו מה מנחשים החברים.
            </p>
          )}
          {sum === TOTAL && !invalid && <Share values={values} pct={pctMode ? pct : undefined} username={session.me?.username} blocs={blocSummary(blocs, values)} open={justSaved} />}
          {pctMode && law && law.r.status === "ok" && <LawSummary law={law} />}
        </div>

        <div>
          <div className="flex gap-1.5 mb-3 flex-wrap" role="radiogroup" aria-label="איך מנחשים">
            {(
              [
                ["seats", "לפי מנדטים"],
                ["pct", "לפי אחוזי הצבעה"],
              ] as const
            ).map(([m, l]) => {
              const on = (pctMode ? "pct" : "seats") === m;
              return (
                <button key={m} type="button" role="radio" aria-checked={on} onClick={() => !on && setMode(m)} className={`min-h-[44px] px-4 rounded-full border-2 text-sm font-bold ${on ? "bg-ink text-paper-card border-ink" : "bg-paper-card text-ink border-paper-line hover:border-ink-faint"}`}>
                  {l}
                </button>
              );
            })}
          </div>
          {pctMode ? (
            <PctList p={p} pct={pct} law={law} pctLeft={pctLeft} setPct={setPct} setCell={setCell} />
          ) : (
            <>
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
                        <button type="button" aria-label={`עוד ל${name}`} disabled={left <= 0} onClick={() => setV(id, c.v + 1)} className="w-11 h-11 rounded-full border-2 border-ink bg-ink text-paper-card text-2xl font-bold leading-none disabled:opacity-30">
                          +
                        </button>
                      </div>
                      <LockToggle name={name} locked={c.locked} onToggle={() => setCell(id, { ...c, locked: !c.locked, src: c.locked ? c.src : "manual" })} />
                    </div>
                    {under && (
                      <p className="text-xs text-warn mt-1">
                        {c.v} {c.v === 1 ? "מנדט" : "מנדטים"} זה פחות מאחוז החסימה (בערך {THRESHOLD_SEATS}). אפשר לשמור — רק שתדעו.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            </>
          )}
          <section className="mt-5 space-y-2" aria-labelledby="blocs-in-seats">
            <h3 id="blocs-in-seats" className="font-display text-3xl leading-none">
              גושים — משלימים את המנדטים
            </h3>
            <p className="text-sm text-ink">ההשערה לגושים והשערת המנדטים הן אותה השערה: סכום המנדטים של כל גוש צריך להתאים ליעד שלו, ולהפך.</p>
            <Blocs unit={blocsUnit} session={session} mySeats={values} embedded onFit={runFill} />
          </section>
          <div className="mt-3 flex gap-2 flex-wrap">
            {!resetAsk ? (
              <Btn onClick={() => setResetAsk(true)}>להתחיל מחדש</Btn>
            ) : (
              <>
                <span className="text-sm self-center">הטיוטה תימחק. בטוח?</span>
                <Btn kind="danger" onClick={() => (unit.setDraft(null), setResetAsk(false))}>
                  כן, מחדש
                </Btn>
                <Btn onClick={() => setResetAsk(false)}>לא</Btn>
              </>
            )}
          </div>
      {/* פס פעולה דביק באזור האגודל */}
      <div className="sticky z-20 bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-4 mt-5">
        {preview && (
          <FillPreview
            preview={preview}
            current={p.seats}
            onApply={apply}
            onClose={() => setPreview(null)}
            returnTo={fillBtn}
          />
        )}
        <div className="bg-paper-card border-2 border-ink rounded-theme shadow-lg px-3 py-2 flex items-center gap-2 flex-wrap">
          {pctMode ? (
            <div className="flex-1 min-w-[7rem]" aria-live="polite">
              <span className="text-xs text-ink-soft block leading-none">{pctLeft >= 0 ? "נותרו %" : "יותר מ-100%"}</span>
              <span className={`font-num tabular text-3xl leading-none ${pctLeft < 0 ? "text-warn" : ""}`}>
                <bdi dir="ltr">{Math.abs(pctLeft).toFixed(1)}%</bdi>
              </span>
            </div>
          ) : (
            <div className="flex-1 min-w-[7rem]" aria-live="polite">
              <span className="text-xs text-ink-soft block leading-none">{left >= 0 ? "נותרו לחלוקה" : "יותר מדי"}</span>
              <span className={`font-num tabular text-3xl leading-none ${left < 0 ? "text-warn" : ""}`}>{Math.abs(left)}</span>
            </div>
          )}
          <button
            ref={fillBtn}
            type="button"
            onClick={runFill}
            aria-haspopup="dialog"
            aria-expanded={!!(preview || pctPreview)}
            className="min-h-[44px] px-4 rounded-full border-2 text-sm font-bold bg-paper-card text-ink border-paper-line hover:border-ink-faint"
          >
            השלם הכול
          </button>
          <SaveButton unit={both} session={session} invalid={invalid ?? blocsInvalid} compact onSaved={() => setJustSaved(true)} />
        </div>
      {crowd && (
        <details className="mt-1 bg-paper-card border border-ink rounded-theme">
          <summary className="cursor-pointer font-bold min-h-[44px] flex items-center px-3">אני</summary>
          <div className="max-h-[45dvh] overflow-y-auto p-3">
          <Explained
            kind="השערות גולשים, אינן סקר"
            source="ההשערות האחרונות של הגולשים באתר (ממוצע), וממוצע הסקרים של האתר"
            asOf={dateLong(POLLS_AS_OF)}
            assumption="הגולשים בחרו להשתתף בעצמם — זה לא מדגם מייצג."
            methodAnchor="crowd"
          >
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="text-ink-soft text-start">
                  <th className="text-start font-normal py-1">רשימה</th>
                  <th className="font-normal">אני</th>
                  <th className="font-normal">הגולשים</th>
                  <th className="font-normal">הסקרים</th>
                </tr>
              </thead>
              <tbody>
                {IDS.map((id) => (
                  <tr key={id} className="border-t border-paper-line">
                    <td className="py-1">{nameOf(id)}</td>
                    <td className="text-center font-bold">{values[id]}</td>
                    <td className="text-center">{crowd[id] ?? "—"}</td>
                    <td className="text-center">{POLLS[id] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Explained>
        </div>
        </details>
      )}
        {pctPreview && <PctFillPreview preview={pctPreview} current={pct} onApply={applyPct} onClose={() => setPctPreview(null)} returnTo={fillBtn} />}
        {pctMode && invalid && pctLeft >= 0 && lawProblem && (
          <p role="alert" className="text-sm text-warn bg-paper-card rounded-theme px-3 py-1 mt-1">
            {lawProblem}
          </p>
        )}
        <SaveError unit={both} />
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

/** שורות האחוזים: צעד 0.1, קלט מספרי, מנעול, והמנדטים שהמנוע חישב — כולל מי מתחת לסף והשפעת הסכמי העודפים */
function PctList({
  p,
  pct,
  law,
  pctLeft,
  setPct,
  setCell,
}: {
  p: SeatsPayload;
  pct: Record<string, number>;
  law: PctSeats | null;
  pctLeft: number;
  setPct: (id: string, v: number) => void;
  setCell: (id: string, c: SeatCell) => void;
}) {
  const ok = law?.r.status === "ok";
  return (
    <>
      <p className="text-sm text-ink-soft mb-2">
        אחוז מהקולות הכשרים לכל רשימה. המנדטים מחושבים מיד לפי החוק — אחוז החסימה ({THRESHOLD_PCT}%), הסכמי העודפים ושיטת באדר-עופר — בדיוק כמו במחשבון
        המנדטים. מה שלא חולק נספר כ"אחרות".
      </p>
      <LockLegend />
      <ul className="divide-y divide-paper-line border-y border-paper-line" aria-label="אחוזי הצבעה לכל רשימה">
        {IDS.map((id) => {
          const c = p.seats[id] ?? { v: 0, src: "manual", locked: false };
          const v = pct[id] ?? 0;
          const name = nameOf(id);
          const under = !!law?.under.includes(id);
          const eff = law?.effect[id] ?? 0;
          return (
            <li key={id} className="py-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className="font-bold block truncate">{name}</span>
                  <span className="text-sm text-ink">
                    {ok ? (
                      <>
                        <span className={`font-bold ${under ? "text-warn" : "text-ink"}`}>{c.v} מנדטים</span>
                        {eff !== 0 && <> · <bdi dir="ltr">{eff > 0 ? `+${eff}` : eff}</bdi> מהסכם העודפים</>}
                      </>
                    ) : (
                      "—"
                    )}
                    {" · "}
                    {rowState(c)}
                  </span>
                </div>
                <div className="flex items-center gap-1" dir="ltr">
                  <button type="button" aria-label={`פחות ל${name}`} disabled={v <= 0} onClick={() => setPct(id, v - 0.1)} className="w-11 h-11 rounded-full border-2 border-ink text-2xl font-bold leading-none disabled:opacity-30 active:bg-ink active:text-paper-card">
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    min={0}
                    max={100}
                    aria-label={`אחוזים ל${name}`}
                    value={v}
                    onChange={(e) => setPct(id, Number(e.target.value))}
                    className="w-[4.5rem] h-11 text-center font-num tabular text-xl bg-paper text-ink rounded-theme border border-paper-line [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ textAlign: "center" }}
                  />
                  <button type="button" aria-label={`עוד ל${name}`} disabled={pctLeft < 0.1 || v >= 100} onClick={() => setPct(id, v + 0.1)} className="w-11 h-11 rounded-full border-2 border-ink bg-ink text-paper-card text-2xl font-bold leading-none disabled:opacity-30">
                    +
                  </button>
                </div>
                <LockToggle name={name} locked={c.locked} onToggle={() => setCell(id, { ...c, locked: !c.locked, src: c.locked ? c.src : "manual" })} />
              </div>
              {under && (
                <p className="text-xs text-warn mt-1">
                  {v}% זה מתחת לאחוז החסימה ({THRESHOLD_PCT}%) — לפי החוק הרשימה לא נכנסת, והקולות שלה לא הופכים למנדטים.
                </p>
              )}
            </li>
          );
        })}
        <li className="py-2 flex items-center justify-between gap-2 text-sm">
          <span className="text-ink-soft">אחרות / קולות שלא עברו</span>
          <span className={`tabular font-bold ${pctLeft < 0 ? "text-warn" : ""}`}>
            <bdi dir="ltr">{pctLeft < 0 ? `${Math.abs(pctLeft).toFixed(1)}% יותר מדי` : `${pctLeft.toFixed(1)}%`}</bdi>
          </span>
        </li>
      </ul>
    </>
  );
}

/** מה החוק עשה: מי נשאר מתחת לסף, וכמה מנדטים הזיזו הסכמי העודפים */
function LawSummary({ law }: { law: PctSeats }) {
  const moved = Object.entries(law.effect);
  return (
    <Explained
      kind="חישוב לפי החוק"
      source="חוק הבחירות לכנסת, סעיפים 81–82; אותו מנוע כמו במחשבון המנדטים"
      asOf="מחושב עכשיו מהאחוזים שלכם"
      assumption="האחוזים מתוך הקולות הכשרים; כל הסכמי העודפים שדווחו ל-2026 פעילים."
      methodAnchor="engine"
    >
      <ul className="text-sm space-y-1">
        <li>
          <span className="text-ink-soft">מתחת לאחוז החסימה: </span>
          {law.under.length ? law.under.map(nameOf).join(", ") : "אף רשימה"}
        </li>
        <li>
          <span className="text-ink-soft">הסכמי העודפים: </span>
          {moved.length
            ? moved.map(([id, d]) => `${nameOf(id)} ${d > 0 ? "+" : "−"}${Math.abs(d)}`).join(" · ")
            : "לא הזיזו אף מנדט בתרחיש הזה"}
        </li>
      </ul>
    </Explained>
  );
}

function PctFillPreview({
  preview,
  current,
  onApply,
  onClose,
  returnTo,
}: {
  preview: PctFillResult;
  current: Record<string, number>;
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
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="pct-fill-title"
      onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())}
      className="absolute bottom-full mb-2 inset-x-0 md:start-auto md:w-[28rem] max-h-[min(60vh,32rem)] overflow-y-auto bg-paper-card text-ink border-2 border-ink rounded-theme shadow-lg p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      {preview.ok ? (
        <>
          <h3 id="pct-fill-title" className="font-display text-3xl leading-none mb-2">
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
                    {current[id] ?? 0}% → {preview.pct[id]}%
                  </bdi>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-soft mb-3">לפי חלק כל רשימה בממוצע הסקרים מ-{dateLong(POLLS_AS_OF)}, כולל החלק של "אחרות". נעולים לא זזו.</p>
          <div className="flex gap-2">
            <Btn kind="primary" onClick={onApply}>
              להחיל
            </Btn>
            <Btn onClick={onClose}>ביטול</Btn>
          </div>
        </>
      ) : (
        <>
          <h3 id="pct-fill-title" className="font-display text-3xl leading-none mb-2">
            אי אפשר להשלים
          </h3>
          <p role="alert" className="text-sm text-warn font-bold mb-2">
            {pctFillErrorText(preview.error)}
          </p>
          <Btn onClick={onClose}>הבנתי</Btn>
        </>
      )}
    </div>
  );
}
