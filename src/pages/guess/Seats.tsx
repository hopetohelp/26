import PersonalBlocs from "../../components/PersonalBlocs";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { BlocsPayload, SeatCell, SeatsPayload } from "../../lib/crowdApi";
import { CROWD_URL } from "../../lib/crowdApi";
import { fillAll, fillErrorText, TOTAL } from "../../lib/fillAll";
import { seatsSum, validateBlocs, validateSeats } from "../../lib/crowdValidate";
import { dateLong } from "../../lib/format";
import { IDS, nameOf, POLL_RANGES, POLL_SHARES, POLLS, POLLS_AS_OF, startSeats, THRESHOLD_SEATS } from "./model";
import { calcOf, pctOf, withPct, withSeats, type Calc } from "./pctSync";
import { Segmented } from "../../components/Choice";
import { Badge } from "../../components/ui";
import { meta, listName, registry } from "../../lib/data";
import { num } from "../../lib/format";
/** אחוז בעשירית — כמו שמקלידים */
const pctFmt = (x: number) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;
import { lineageRows, start2022 } from "../../lib/lineage";
import { useCrowd, useLineage } from "./useLineage";
import { seatsFmt } from "../../lib/format";
import { blocSummary } from "./blocSummary";
import { canSetSeats } from "./seatEditing";
import SaveButton, { SaveError, type SaveUnit } from "./SaveButton";
import SeatBoard from "./SeatBoard";
import Share from "./Share";
import { ActionBar, Btn, ShortLabel, StatusPill } from "./ui";
import type { useSession, useUnit } from "./useCrowd";

const START_OPTIONS: { id: SeatsPayload["start"]; title: string; desc: string }[] = [
  { id: "zero", title: "מאפס", desc: "120 מושבים ריקים. אתם מחלקים הכול." },
  { id: "polls", title: "מממוצע הסקרים", desc: `הממוצע נכון ל-${dateLong(POLLS_AS_OF)}. משנים מה שרוצים.` },
  { id: "k25", title: "מבחירות 22", desc: "התוצאה של 2022 לפי השיוך של כל מפלגה היום." },
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
  const typedFrom = useRef<Record<string, number>>({});
  const values = useMemo(() => Object.fromEntries(IDS.map((id) => [id, p?.seats[id]?.v ?? 0])), [p]);
  const lineage = useLineage(session);
  const { seats: crowd, pct: crowdPct } = useCrowd();
  const lin = lineage.draft.split === "crowd" && !crowd ? { ...lineage.draft, split: "polls" as const } : lineage.draft;
  const rows22 = Object.fromEntries(lineageRows(lin, crowd).rows.map((r) => [r.id, r]));
  const [cmp, setCmp] = useCompare();
  // מתג מנדטים | אחוזים (הכרעת בעלים 10.10.2026): קובע מה מקלידים; הערך השני מוצג קטן לידו
  const [params] = useSearchParams();
  const [view, setView] = useState<"seats" | "pct">(() => (params.get("unit") === "pct" || p?.mode === "pct" ? "pct" : "seats"));
  const pctNow = useMemo(() => (p ? pctOf(p) : null), [p]);

  /** נקודת פתיחה שמכבדת יעד שכבר נכתב לגוש (הכרעת בעלים 8.10.2026): בכל שלוש האפשרויות, ההשלמה מתאימה את הגושים ליעד */
  const startWithTargets = (start: SeatsPayload["start"]): SeatsPayload => {
    const base = start === "k25"
      ? { ...startSeats("zero"), start, seats: Object.fromEntries(Object.entries(start2022(lin, crowd)).map(([id, c]) => [id, { v: c.v, src: c.locked ? "manual" as const : "filled" as const, locked: c.locked }])) }
      : startSeats(start);
    if (!blocs?.blocs.some((b) => b.target !== null)) return base;
    const r = fillAll(IDS, base.seats, POLLS, blocs.blocs, POLL_RANGES);
    return r.ok ? { ...base, seats: r.seats, pollsAsOf: POLLS_AS_OF } : base;
  };

  const startTargets = blocs?.blocs.filter((b) => b.target !== null) ?? [];
  const targetNote = startTargets.length ? `מותאם ליעדי הגושים שלכם: ${startTargets.map((b) => `${b.name} ${b.target}`).join(", ")}.` : null;

  if (!p) {
    return (
      <div>
        <HowTo />
        <h2 className="text-3xl font-display leading-tight mb-3">מאיפה מתחילים?</h2>
        <div className="grid sm:grid-cols-3 gap-3 items-start [&>*]:min-w-0">
          {START_OPTIONS.map((o) => (
            <div key={o.id}>
              <button
                type="button"
                onClick={() => unit.setDraft(startWithTargets(o.id))}
                className="w-full text-start bg-paper-card border-2 border-paper-line hover:border-ink rounded-theme p-4 min-h-[44px]"
              >
                <span className="text-xl font-display leading-tight block mb-1">{o.title}</span>
                <span className="text-sm text-ink-soft leading-relaxed block">{o.desc}</span>
                {targetNote && <span className="text-sm text-ink font-bold leading-relaxed block mt-1">{targetNote}</span>}
              </button>
              {o.id === "k25" && <Link to="/changes" className="inline-flex items-center min-h-[44px] text-sm">איך המפלגות משויכות להיום?</Link>}
            </div>
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
    const seats = { ...p.seats, [id]: c };
    // שינוי נעילה בלבד — בלי חישוב מחדש; שינוי מספר ⇐ האחוזים מחושבים מחדש מהמנדטים
    unit.setDraft(c.v === p.seats[id]?.v ? { ...p, seats } : withSeats(p, seats));
    setPreview(null);
  };
  /** snap = false בזמן הקלדה (כדי שאפשר יהיה להקליד 12); היישור נעשה ביציאה מהשדה מול הערך שלפני ההקלדה */
  const setV = (id: string, v: number, snap = true, from = p.seats[id]?.v ?? 0) => {
    const value = snap ? snapSeats(v, from) : Math.max(0, Math.min(TOTAL, Math.round(v) || 0));
    if (!canSetSeats(p.seats, IDS, id, value)) {
      setEditError("אי אפשר להוסיף מעל 120 בלי להשאיר מפלגה אחרת פתוחה. פתחו נעילה של מפלגה אחרת או הפחיתו מנדטים.");
      return;
    }
    setCell(id, { v: value, src: "manual", locked: true });
  };
  const targets = blocs?.blocs.filter((b) => b.target !== null) ?? [];
  const runFill = () => setPreview(fillAll(IDS, p.seats, POLLS, blocs?.blocs ?? [], POLL_RANGES));
  const apply = () => {
    // "השלם הכול" — אותה השלמה בשני המצבים (גושים, נעילות, טווחי הסקרים); באחוזים — האחוזים מחושבים מהתוצאה
    if (preview?.ok) unit.setDraft(withSeats(p, preview.seats, { pollsAsOf: POLLS_AS_OF }, view));
    setEditError(null);
    setPreview(null);
  };
  const rows = IDS;
  const calc = calcOf(p);
  const pctSum = pctNow ? IDS.reduce((a, id) => a + (pctNow[id] || 0), 0) : 0;
  /** עריכה באחוזים: המנדטים לפי החוק; רשימה שהוקלדה ננעלת */
  const setPctValue = (id: string, v: number) => {
    const next = { ...(pctNow ?? {}), [id]: Math.max(0, Math.min(100, Math.round((Number.isFinite(v) ? v : 0) * 10) / 10)) };
    const r = withPct(p, next, { touched: id });
    unit.setDraft(r.payload);
    setEditError(r.error);
    setPreview(null);
  };
  const setCalc = (c: Calc) => {
    if (view === "pct" && pctNow) { const r = withPct(p, pctNow, { calc: c }); unit.setDraft(r.payload); setEditError(r.error); }
    else unit.setDraft(withSeats({ ...p, calculation: c }, p.seats));
  };

  return (
    <div>
      <HowTo />
          <PersonalBlocs title="הגושים שלי: חלוקת ההשערה ויעדי ההשלמה" values={values} source="חלוקת המנדטים בהשערה שלכם וצפי לכל גוש" asOf="הטיוטה הנוכחית" editTargets />
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5 [&>*]:min-w-0 items-start">
        <div className="lg:sticky lg:top-4 space-y-3">
          <div className="relative">
            <SeatBoard values={values} />
            {sum === TOTAL && !invalid && <Share values={values} pct={p.mode === "pct" ? p.pct : undefined} username={session.me?.username} blocs={blocSummary(blocs, values)} open={justSaved} />}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={both.status} queued={unit.queued || (blocsToSave && blocsUnit.queued)} />
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
        </div>

        <div>
            {targets.length > 0 && <p className="text-sm text-ink mb-2">"השלם הכול" מתחשב גם ביעדי הגושים שלכם ({targets.map((b) => `${b.name}: ${b.target}`).join(", ")}).</p>}
            <CompareToggles value={cmp} onChange={setCmp} view={view} onView={setView} />
            {cmp.length > 0 && (
              <div className="flex items-end gap-2 text-xs text-ink-soft pb-1 border-b-2 border-ink/30" aria-hidden="true">
                <div className="flex-1 min-w-0"><CompareCells on={cmp} cells={{ k22: <Link to="/changes" className="underline">בחירות 22</Link>, polls: "סקרים", crowd: "גולשים" }} /></div>
              </div>
            )}
            <ul className="divide-y divide-ink/15 border-b border-ink/15" aria-label="מנדטים לכל רשימה">
              {rows.map((id) => {
                const c = p.seats[id] ?? { v: 0, src: "manual", locked: false };
                const name = nameOf(id);
                return (
                  <li key={id} className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold block truncate">{name}</span>
                        <span className="sr-only">{rowState(c)}</span>
                        {cmp.length > 0 && <CompareCells on={cmp} cells={view === "seats" ? {
                          k22: rows22[id]?.category === "none" ? "—" : rows22[id]?.category === "partial" ? `~${seatsFmt(Math.round(rows22[id].seats2022 * 10) / 10)}` : seatsFmt(rows22[id]?.seats2022 ?? 0),
                          polls: seatsFmt(POLLS[id] ?? 0),
                          crowd: crowd ? seatsFmt(Math.round((crowd[id] ?? 0) * 10) / 10) : "—",
                        } : {
                          k22: rows22[id]?.category === "none" ? "—" : `${rows22[id]?.category === "partial" ? "~" : ""}${pctFmt(rows22[id]?.share2022 ?? 0)}`,
                          polls: pctFmt(POLL_SHARES[id] ?? 0),
                          // ממוצע האחוזים של הגולשים, כמו בסקר האתר
                          crowd: crowdPct ? pctFmt(crowdPct[id] ?? 0) : "—",
                        }} labels />}
                      </div>
                      {view === "pct" ? (
                        <div className="flex flex-col items-center">
                          <label className="flex items-center gap-1" dir="ltr">
                            <input
                              type="number"
                              inputMode="decimal"
                              step={0.1}
                              min={0}
                              max={100}
                              aria-label={`אחוזים ל${name}`}
                              value={pctNow?.[id] ?? 0}
                              onChange={(e) => setPctValue(id, Number(e.target.value))}
                              className="w-20 h-11 text-center font-num tabular text-xl bg-paper text-ink rounded-theme border border-paper-line [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                              style={{ textAlign: "center" }}
                            />
                            <span className="text-sm text-ink-soft">%</span>
                          </label>
                          <span className="text-xs text-ink-soft tabular">{c.v ? `${c.v} מנדטים` : (pctNow?.[id] ?? 0) > 0 ? <Badge tone="warn">מתחת לסף</Badge> : "0 מנדטים"}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
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
                            onFocus={() => (typedFrom.current[id] = c.v)}
                            onChange={(e) => setV(id, Number(e.target.value), false)}
                            onBlur={() => setV(id, c.v, true, typedFrom.current[id] ?? c.v)}
                            className="w-14 h-11 text-center font-num tabular text-2xl bg-paper text-ink rounded-theme border border-paper-line [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ textAlign: "center" }}
                          />
                          <button type="button" aria-label={`עוד ל${name}`} disabled={c.v >= TOTAL || !canSetSeats(p.seats, IDS, id, snapSeats(c.v + 1, c.v))} onClick={() => setV(id, c.v + 1)} className="w-11 h-11 rounded-full border-2 border-ink bg-ink text-paper-card text-2xl font-bold leading-none disabled:opacity-30">
                            +
                          </button>
                        </div>
                          <span className="text-xs text-ink-soft tabular" dir="ltr">{pctNow ? `≈${pctFmt(pctNow[id] ?? 0)}` : ""}</span>
                        </div>
                      )}
                      <LockToggle name={name} locked={c.locked} onToggle={() => setCell(id, { ...c, locked: !c.locked, src: c.locked ? c.src : "manual" })} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {view === "pct" && pctNow && <p className="text-sm text-ink-soft mt-2">אחרות (רשימות שאינן כאן): <span className={`tabular ${pctSum > 100.05 ? "text-warn font-bold" : ""}`}>{pctSum > 100.05 ? `חריגה: ${pctFmt(pctSum)}` : pctFmt(Math.max(0, 100 - pctSum))}</span></p>}
            <CalcAssumptions calc={calc} onChange={setCalc} />
      <ActionBar above={<>
        {(left < 0 || editError) && <p role="alert" className="rounded-theme border-2 border-warn bg-paper-card text-ink p-3 text-sm font-bold">
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
        {both.error && <div className="bg-paper-card rounded-theme"><SaveError unit={both} /></div>}
        {invalid && left === 0 && <p role="status" className="bg-paper-card rounded-theme p-2 text-sm text-warn">{invalid}</p>}
        {!CROWD_URL && <p className="sr-only">השמירה עוד לא פעילה באתר.</p>}
      </>}>
        {resetAsk ? (
          <>
            <span className="text-sm">הטיוטה תימחק. בטוח?</span>
            <Btn onClick={() => setResetAsk(false)}>לא</Btn>
            <Btn kind="danger" onClick={() => (unit.setDraft(null), setEditError(null), setResetAsk(false))}>כן, מחדש</Btn>
          </>
        ) : (
          <>
            <div className="min-w-0 px-1" aria-live="polite">
              {view === "pct" ? <>
                <span className="text-xs text-ink-soft block leading-none">סכום האחוזים</span>
                <span className={`font-num tabular text-2xl leading-none ${pctSum > 100.05 ? "text-warn" : ""}`}>{pctFmt(pctSum)}</span>
              </> : <>
                <span className="text-xs text-ink-soft block leading-none">{left >= 0 ? "נותרו לחלוקה" : "יותר מדי"}</span>
                <span className={`font-num tabular text-3xl leading-none ${left < 0 ? "text-warn" : ""}`}>{Math.abs(left)}</span>
              </>}
            </div>
            <Btn onClick={() => setResetAsk(true)}><ShortLabel short="אפס" full="אפס הכול" /></Btn>
            <button
              ref={fillBtn}
              type="button"
              onClick={runFill}
              aria-haspopup="dialog"
              aria-expanded={!!preview}
              className="min-h-[44px] px-4 whitespace-nowrap rounded-full border-2 text-sm font-bold bg-paper-card text-ink border-paper-line hover:border-ink-faint"
            >
              <ShortLabel short="השלם" full="השלם הכול" />
            </button>
            <SaveButton unit={both} session={session} invalid={invalid ?? blocsInvalid} compact onSaved={() => setJustSaved(true)} />
          </>
        )}
      </ActionBar>

        </div>
      </div>


    </div>
  );
}

/** אין 1–3 מנדטים (הכרעת בעלים 8.10.2026): עלייה לתחום קופצת לסף, ירידה אליו — ל-0 */
export function snapSeats(v: number, from: number): number {
  const value = Math.max(0, Math.min(TOTAL, Math.round(v) || 0));
  if (value > 0 && value < THRESHOLD_SEATS) return value > from ? THRESHOLD_SEATS : 0;
  return value;
}

/** מה כתוב בשורה (הכפתור שלידה כבר אומר נעול/פתוח): הערך שלכם · הושלם אוטומטית · טרם נקבע */
const rowState = (c: SeatCell) => (c.locked ? "הערך שלכם" : c.src === "filled" ? "הושלם אוטומטית" : "טרם נקבע");

/** כפתור נעילה — אייקון ועיצוב בלבד (הכרעת בעלים 10.10.2026): נעול = מלא וכהה, פתוח = ריק עם קו מקווקו. השם המלא בתווית לקורא מסך. */
function LockChip({ locked }: { locked: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full border-2 ${locked ? "bg-ink text-paper-card border-ink" : "bg-paper-card text-ink border-dashed border-ink-soft"}`}>
      <Lock on={locked} />
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
/** כרטיס פתוח "איך משערים?", ובתחתיתו מגירה אחת לכל ההסברים (הכרעת בעלים 10.10.2026) */
function HowTo() {
  return (
    <section className="mb-4 rounded-theme border border-paper-line bg-paper-card p-4" aria-labelledby="howto-title">
      <h2 id="howto-title" className="text-xl font-display leading-tight mb-2">איך משערים?</h2>
      <ol className="text-sm text-ink list-decimal ps-5 space-y-1">
        <li>מגדירים גוש משלכם, או נשארים עם ברירת המחדל.</li>
        <li>מגדירים מספר מנדטים כולל לגוש, או משאירים ריק.</li>
        <li>בוחרים מאיפה מתחילים: מאפס, מממוצע הסקרים או מבחירות 22.</li>
        <li>נועלים מפלגה או משנים לה את המספר.</li>
        <li>לוחצים "השלם הכול": המפלגות הנעולות ומספרי הגושים נשמרים, ושאר המפלגות מקבלות את היתרה ביחס לסקרים.</li>
      </ol>
      <details className="group mt-3 border-t border-paper-line [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[44px] text-sm font-bold">
          הסברים
          <span aria-hidden="true" className="text-ink-soft text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-3 text-sm pb-1">
          <div className="flex items-center gap-3"><span className="shrink-0" aria-hidden="true"><LockChip locked /></span><p><b>נעול:</b> המספר שלכם. "השלם הכול" לא ישנה אותו. מספר שמקלידים ננעל מעצמו.</p></div>
          <div className="flex items-center gap-3"><span className="shrink-0" aria-hidden="true"><LockChip locked={false} /></span><p><b>פתוח:</b> "השלם הכול" רשאי לשנות אותו. לחיצה על המנעול נועלת או פותחת.</p></div>
          <p><b>מנדטים או אחוזים:</b> המתג קובע מה מקלידים, והשני מתעדכן לבד. מאחוזים למנדטים — לפי חוק הבחירות, כמו בספירה האמיתית. ממנדטים לאחוזים — האחוז שנותן בדיוק את אותם מנדטים; מפלגה עם 0 שומרת על האחוז שלה, מתחת לסף.</p>
          <p><b>אחוז החסימה:</b> מפלגה צריכה לפחות 4 מנדטים כדי להיכנס לכנסת. לכן אין 1, 2 או 3 מנדטים — מעלים ל-4 או מורידים ל-0.</p>
          <p><b>בחירות 22 · סקרים · גולשים:</b> שלושה מספרים להשוואה ליד כל מפלגה. אפשר להסתיר כל אחד מהם. "בחירות 22" — לפי השיוך במסך <Link to="/changes">מה השתנה</Link>; "~" = חלק מרשימה שהתפצלה. "גולשים" — ממוצע ההשערות באתר, אינו סקר.</p>
          <p><b>שמירה:</b> נשמרת בחשבון שלכם, ורק ההשערה האחרונה נספרת בסטטיסטיקות.</p>
        </div>
      </details>
    </section>
  );
}

/** הנחות החישוב (שיעור הצבעה, בעלי זכות, הסכמי עודפים) — משפיעות על המעבר בין אחוזים למנדטים */
function CalcAssumptions({ calc, onChange }: { calc: Calc; onChange: (c: Calc) => void }) {
  const AG = meta.agreements2026;
  const on = (pair: readonly string[]) => calc.agreements.some((x) => x.join() === pair.join());
  return (
    <details className="group mt-4 border-y border-paper-line [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[44px] text-sm font-bold">
        הנחות החישוב
        <span aria-hidden="true" className="text-ink-soft text-xl transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="pb-3 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col">שיעור הצבעה (%)
            <input type="number" step={0.5} min={40} max={90} value={calc.turnout} onChange={(e) => { const v = Number(e.target.value); if (v > 0 && v <= 100) onChange({ ...calc, turnout: v }); }} className="mt-1 min-h-[44px] border border-paper-line rounded-theme px-2 tabular bg-paper-card" />
          </label>
          <label className="flex flex-col">בעלי זכות בחירה
            <input type="number" step={10000} value={calc.eligible} onChange={(e) => { const v = Number(e.target.value); if (v > 0 && v <= 100000000) onChange({ ...calc, eligible: v }); }} className="mt-1 min-h-[44px] border border-paper-line rounded-theme px-2 tabular bg-paper-card" />
          </label>
        </div>
        <p className="text-xs text-ink-soft">ברירת המחדל: {num(registry.k26.eligible)} בעלי זכות (דווח בתקשורת, טרם אומת), שיעור הצבעה 70%, פסולים 0.6%.</p>
        <fieldset>
          <legend className="font-bold">הסכמי עודפים</legend>
          {AG.map((a) => (
            <label key={a.pair.join()} className="flex items-center gap-2 min-h-[44px]">
              <input type="checkbox" checked={on(a.pair)} onChange={() => onChange({ ...calc, agreements: on(a.pair) ? calc.agreements.filter((x) => x.join() !== a.pair.join()) : [...calc.agreements, [...a.pair]] })} />
              {listName(a.pair[0])} – {listName(a.pair[1])}
              <Badge tone="warn">{a.status === "reported_single_source" ? "דווח במקור יחיד" : "דווח, טרם רשמי"}</Badge>
            </label>
          ))}
          <p className="text-xs text-ink-soft">ההסכמים הרשמיים מוגשים עד 16.10.2026 ומתפרסמים עד 19.10.2026.</p>
        </fieldset>
      </div>
    </details>
  );
}

type CompareKey = "k22" | "polls" | "crowd";
const COMPARE: { id: CompareKey; label: string }[] = [{ id: "k22", label: "בחירות 22" }, { id: "polls", label: "סקרים" }, { id: "crowd", label: "גולשים" }];
const CMP_KEY = "elections26.compare";
/** אילו טורי השוואה מוצגים — נשמר בדפדפן */
function useCompare(): [CompareKey[], (v: CompareKey[]) => void] {
  const [v, setV] = useState<CompareKey[]>(() => {
    try { const x = JSON.parse(localStorage.getItem(CMP_KEY) ?? "null"); if (Array.isArray(x)) return COMPARE.map((c) => c.id).filter((id) => x.includes(id)); } catch { /* ברירת מחדל */ }
    return COMPARE.map((c) => c.id);
  });
  return [v, (next) => { setV(next); try { localStorage.setItem(CMP_KEY, JSON.stringify(next)); } catch { /* לא נשמר */ } }];
}
const CHIP = "min-h-[32px] px-2.5 rounded-full border text-xs font-bold";
const chipCls = (on: boolean) => `${CHIP} ${on ? "bg-ink text-paper-card border-ink" : "bg-paper-card text-ink-soft border-paper-line"}`;
/** שורה אחת: מתג מנדטים | אחוזים, ולידו שלושת מספרי ההשוואה — באותו עיצוב */
function CompareToggles({ value, onChange, view, onView }: { value: CompareKey[]; onChange: (v: CompareKey[]) => void; view: "seats" | "pct"; onView: (v: "seats" | "pct") => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <Segmented size="sm" label="מה מקלידים" value={view} onChange={onView} className="!inline-grid w-auto text-xs" options={[{ id: "seats", label: "מנדטים" }, { id: "pct", label: "אחוזים" }]} />
      <span aria-hidden="true" className="w-px h-6 bg-paper-line" />
      <div role="group" aria-label="מספרים להשוואה" className="flex flex-wrap items-center gap-1">
        {COMPARE.map((c) => {
          const on = value.includes(c.id);
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : COMPARE.map((x) => x.id).filter((id) => id === c.id || value.includes(id)))} className={chipCls(on)}>
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
/** שלושה מספרים קטנים בטורים קבועים — מתחת לשם המפלגה, מיושרים לכותרת שמעל הרשימה */
function CompareCells({ on, cells, labels = false }: { on: CompareKey[]; cells: Record<CompareKey, ReactNode>; labels?: boolean }) {
  return (
    <span className="flex text-xs mt-0.5">
      {COMPARE.filter((c) => on.includes(c.id)).map((c) => (
        <span key={c.id} className={`w-16 shrink-0 truncate px-1.5 border-s border-paper-line first:border-s-0 first:ps-0 ${labels ? "font-num tabular text-ink-soft" : ""}`}>
          {labels && <span className="sr-only">{c.label}: </span>}
          {labels ? <bdi dir="ltr">{cells[c.id]}</bdi> : cells[c.id]}
        </span>
      ))}
    </span>
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
      className="w-[min(28rem,calc(100vw-2rem))] max-h-[min(60vh,32rem)] overflow-y-auto bg-paper-card text-ink border-2 border-ink rounded-theme shadow-lg p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      {preview.ok ? (
        <>
          <h3 id="fill-preview-title" className="text-xl font-display leading-tight mb-2">
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
          <h3 id="fill-preview-title" className="text-xl font-display leading-tight mb-2">
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
