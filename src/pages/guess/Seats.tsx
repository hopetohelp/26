import CardDrawer from "../../components/CardDrawer";
import { GuessChart } from "./Workspace";
import SourcePicker from "../../components/SourcePicker";
import { useSourcePreference } from "../../lib/sourcePreference";
import { resolveDataset, resolveSupport, resolveSupportMetric, selectedPolls, type Selection } from "../../lib/dataResolver";
import { DATA_PRODUCTS } from "../../lib/dataCatalog";
import PersonalBlocs from "../../components/PersonalBlocs";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { BlocsPayload, SeatCell, SeatsPayload } from "../../lib/crowdApi";
import { CROWD_URL } from "../../lib/crowdApi";
import { fillAll, fillErrorText, TOTAL } from "../../lib/fillAll";
import { seatsSum, validateBlocs, validateSeats } from "../../lib/crowdValidate";
import { date, pctOne, rng } from "../../lib/format";
import ClosedNote from "./ClosedNote";
import { dropClosed, GUESS_IDS, IDS, nameOf, POLL_RANGES, POLLS_AS_OF, startSeats, THRESHOLD_SEATS } from "./model";
import { calcOf, pctOf, withPct, withSeats, type Calc } from "./pctSync";
import { Segmented } from "../../components/Choice";
import { Badge } from "../../components/ui";
import { meta, listName, registry } from "../../lib/data";
import { num } from "../../lib/format";
/** בתצוגה הראשית אחוז נכתב בעשירית, וממוצע חיובי קטן נכתב במאיות. */
const pctFmt = pctOne;
import { lineageRows, start2022 } from "../../lib/lineage";
import { useCrowd, useLineage } from "./useLineage";
import { pollSeatRange } from "../../lib/pollRange";
import { seatsFmt } from "../../lib/format";
import { blocSummary } from "./blocSummary";
import { canSetSeats } from "./seatEditing";
import SaveButton, { SaveError, type SaveUnit } from "./SaveButton";
import SeatBoard from "./SeatBoard";
import SeatPicker from "./SeatPicker";
import Share from "./Share";
import { PartyAvatar } from "../../components/PartyAvatar";
import { ActionBar, Btn, ShortLabel, StatusPill } from "./ui";
import type { useSession, useUnit } from "./useCrowd";

const START_OPTIONS: { id: SeatsPayload["start"]; title: string; desc: string }[] = [
  { id: "zero", title: "מאפס", desc: "120 מושבים ריקים. אתם מחלקים הכול." },
  { id: "polls", title: "מממוצע הסקרים", desc: `הממוצע נכון ל-${date(POLLS_AS_OF)}. משנים מה שרוצים.` },
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
  const preference = useSourcePreference("guess");
  const [temporary, setTemporary] = useState<Selection | null>(null);
  const selection = temporary ?? preference.selection;
  const current = resolveDataset(selection, "guess");
  const POLLS = current.seats;
  const POLL_SHARES = resolveSupport(selection).shares ?? {};
  const LATEST_POLLS = selectedPolls(selection);
  const sourceName = current.rows[0]?.label ?? DATA_PRODUCTS[selection.product].name;
  const sourcePicker = <SourcePicker screen="guess" selection={selection} onChange={setTemporary} notice={preference.notice} />;
  const p = unit.draft;
  const blocs = blocsUnit.draft;
  const [preview, setPreview] = useState<ReturnType<typeof fillAll> | null>(null);
  const [resetAsk, setResetAsk] = useState(false);
  const fillBtn = useRef<HTMLButtonElement>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const values = useMemo(() => Object.fromEntries(GUESS_IDS.map((id) => [id, p?.seats[id]?.v ?? 0])), [p]);
  // השערה שנשמרה לפני ההחלטה עם רשימה שלא עברה באף סקר (הכרעת בעלים 24.10.2026): הרשימה יורדת, והמנדטים שלה פנויים לחלוקה מחדש
  useEffect(() => { const clean = dropClosed(p); if (clean) unit.setDraft(clean); }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineage = useLineage(session);
  const { seats: crowd } = useCrowd();
  const lin = lineage.draft.split === "crowd" && !crowd ? { ...lineage.draft, split: "polls" as const } : lineage.draft;
  const rows22 = Object.fromEntries(lineageRows(lin, crowd).rows.map((r) => [r.id, r]));
  // מתג מנדטים | אחוזים (הכרעת בעלים 10.10.2026): קובע מה מקלידים; הערך השני מוצג קטן לידו
  const [params] = useSearchParams();
  const [view, setView] = useState<"seats" | "pct">(() => (params.get("unit") === "pct" || p?.mode === "pct" ? "pct" : "seats"));
  const requestedUnit = params.get("unit");
  useEffect(() => {
    if (requestedUnit === "pct" || requestedUnit === "seats") setView(requestedUnit);
  }, [requestedUnit]);
  const pctNow = useMemo(() => (p ? pctOf(p) : null), [p]);

  /** נקודת פתיחה שמכבדת יעד שכבר נכתב לגוש (הכרעת בעלים 8.10.2026): בכל שלוש האפשרויות, ההשלמה מתאימה את הגושים ליעד */
  const startWithTargets = (start: SeatsPayload["start"]): SeatsPayload => {
    const base = start === "k25"
      ? { ...startSeats("zero"), start, seats: Object.fromEntries(Object.entries(start2022(lin, crowd)).map(([id, c]) => [id, { v: c.v, src: c.locked ? "manual" as const : "filled" as const, locked: c.locked }])) }
      : start === "polls" ? { ...startSeats("zero"), start: "polls" as const, pollsAsOf: POLLS_AS_OF, seats: Object.fromEntries(GUESS_IDS.map(id => [id, { v: POLLS[id] ?? 0, src: "filled" as const, locked: false }])) } : startSeats(start);
    if (start === "polls") {
      const completed = fillAll(GUESS_IDS, startSeats("zero").seats, POLLS, blocs?.blocs ?? [], POLL_RANGES);
      return completed.ok ? { ...base, seats: completed.seats } : base;
    }
    if (!blocs?.blocs.some((b) => b.target !== null)) return base;
    const r = fillAll(GUESS_IDS, base.seats, POLLS, blocs.blocs, POLL_RANGES);
    return r.ok ? { ...base, seats: r.seats, pollsAsOf: POLLS_AS_OF } : base;
  };

  const startTargets = blocs?.blocs.filter((b) => b.target !== null) ?? [];
  const targetNote = startTargets.length ? `מותאם ליעדי הגושים שלכם: ${startTargets.map((b) => `${b.name} ${b.target}`).join(", ")}.` : null;

  if (!p) {
    return (
      <div className="c-guess-workspace c-guess-start">
        <div className="c-guess-start-controls">{sourcePicker}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
          <h2 className="text-3xl font-display leading-tight">מאיפה מתחילים?</h2>
          <Link to="/changes" className="text-sm">איך המפלגות משויכות להיום?</Link>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 [&>*]:min-w-0">
          {START_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={o.id === "polls" && !current.rows.some(r => r.status === "available")}
              onClick={() => unit.setDraft(startWithTargets(o.id))}
              className="text-start bg-paper-card border-2 border-paper-line hover:border-ink rounded-theme p-4 min-h-[44px]"
            >
              <span className="text-xl font-display leading-tight block mb-1">{o.id === "polls" ? `לפי ${sourceName}` : o.title}</span>
              <span className="text-sm text-ink-soft leading-relaxed block">{o.id === "polls" ? current.rows.some(r => r.status === "available") ? "נקודת פתיחה לעריכה שלכם" : "אין בסיס לחישוב" : o.desc}</span>
              {targetNote && <span className="text-sm text-ink font-bold leading-relaxed block mt-1">{targetNote}</span>}
            </button>
          ))}
        </div>
        </div><GuessChart><div className="c-guess-hall opacity-80">
          <SeatBoard values={{}} />
        </div></GuessChart>
      </div>
    );
  }

  const sum = seatsSum(p);
  const left = TOTAL - sum;
  const invalid = validateSeats(p, GUESS_IDS);
  // שמירה אחת למנדטים ולכל חלוקת גושים שנערכה, גם בלי יעד מספרי.
  // שמירות גושים ישנות — לא נשלחות עוד (הכרעת בעלים 25.10.2026: מתעלמים מהן)
  const blocsToSave = false;
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
    if (!canSetSeats(p.seats, GUESS_IDS, id, value)) {
      setEditError("אי אפשר להוסיף מעל 120 בלי להשאיר מפלגה אחרת פתוחה. פתחו נעילה של מפלגה אחרת או הפחיתו מנדטים.");
      return;
    }
    setCell(id, { v: value, src: "manual", locked: true });
  };
  const targets = blocs?.blocs.filter((b) => b.target !== null) ?? [];
  const runFill = () => setPreview(fillAll(GUESS_IDS, p.seats, POLLS, blocs?.blocs ?? [], POLL_RANGES));
  const apply = () => {
    // "השלם הכול" — אותה השלמה בשני המצבים (גושים, נעילות, טווחי הסקרים); באחוזים — האחוזים מחושבים מהתוצאה
    if (preview?.ok) unit.setDraft(withSeats(p, preview.seats, { pollsAsOf: POLLS_AS_OF }, view));
    setEditError(null);
    setPreview(null);
  };
  const rows = GUESS_IDS;
  const pollPctRange = (id: string): [number, number] | null => resolveSupportMetric(selection, [id], "guess").range;
  const lock = (id: string, c: SeatCell, name: string) => <LockToggle name={name} locked={c.locked} onToggle={() => setCell(id, { ...c, locked: !c.locked, src: c.locked ? c.src : "manual" })} />;
  const calc = calcOf(p);
  const pctSum = pctNow ? GUESS_IDS.reduce((a, id) => a + (pctNow[id] || 0), 0) : 0;
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
      {sourcePicker}
      <PersonalBlocs title="חלוקת הכנסת" values={values} source="חלוקת המנדטים בניחוש שלכם וצפי לכל גוש" asOf="הטיוטה הנוכחית" editTargets />
      <div className="c-guess-workspace">
        <GuessChart><div className="c-guess-hall space-y-3">
          <div className="relative">
            <SeatBoard values={values} />
            {sum === TOTAL && !invalid && <Share selection={selection} values={values} pct={p.mode === "pct" ? p.pct : undefined} username={session.me?.username} blocs={blocSummary(blocs, values)} open={justSaved} />}
          </div>
          {both.status !== "draft" && (both.status !== "saved" || unit.queued || (blocsToSave && blocsUnit.queued)) && <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={both.status} queued={unit.queued || (blocsToSave && blocsUnit.queued)} />
          </div>}
          {justSaved && both.status === "saved" && (
            <div role="status" className="flex items-center gap-2 flex-wrap">
              <Btn kind="primary" onClick={onStatistics}>מעבר לסטטיסטיקות</Btn>
            </div>
          )}
        </div></GuessChart>

        <div className="c-guess-editor">
            <div className="seat-box">
            <CompareHeader sourceName={sourceName} view={view} onView={setView} />
            <ul className="divide-y divide-ink/15 border-b border-ink/15" aria-label="מנדטים לכל רשימה">
              {rows.map((id) => {
                const c = p.seats[id] ?? { v: 0, src: "manual", locked: false };
                const name = nameOf(id);
                return (
                  <li key={id} className="py-2">
                    <div className="seat-grid">
                      <div className="seat-name min-w-0 flex items-center gap-2">
                        <PartyAvatar id={id} size={28} />
                        <span className="font-bold block min-w-0 leading-tight [overflow-wrap:anywhere]">{name}</span>
                        <span className="sr-only">{rowState(c)}</span>
                      </div>
                      <div className="seat-cells"><CompareCells sourceName={sourceName} cells={view === "seats" ? {
                          k22: { mean: rows22[id]?.category === "none" ? "—" : rows22[id]?.category === "partial" ? `~${seatsFmt(Math.round(rows22[id].seats2022 * 10) / 10)}` : seatsFmt(rows22[id]?.seats2022 ?? 0) },
                          polls: { mean: POLLS[id] === undefined ? "—" : seatsFmt(POLLS[id]), range: rangeText(pollSeatRange(LATEST_POLLS, [id]), seatsFmt) },
                        } : {
                          k22: { mean: rows22[id]?.category === "none" ? "—" : `${rows22[id]?.category === "partial" ? "~" : ""}${pctFmt(rows22[id]?.share2022 ?? 0)}` },
                          // טווח הסקרים באחוזים: הנמוך והגבוה במנדטים, מומרים לאחוזים לפי חוק הבחירות
                          polls: { mean: POLL_SHARES[id] === undefined ? "—" : pctFmt(POLL_SHARES[id]), range: rangeText(pollPctRange(id), pctFmt) },
                        }} /></div>
                      {view === "pct" ? (
                        <div className="seat-ctl flex items-start gap-2" dir="ltr">
                          {lock(id, c, name)}
                          <div className="flex flex-col items-center">
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
                            <span className="text-xs text-ink-soft tabular" dir="rtl">{c.v ? `${c.v} מנדטים` : (pctNow?.[id] ?? 0) > 0 ? <Badge tone="warn">מתחת לסף</Badge> : "0 מנדטים"}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="seat-ctl flex items-start gap-2" dir="ltr">
                          {lock(id, c, name)}
                          <div className="flex flex-col items-center">
                            <SeatPicker value={c.v} name={name} onCommit={(v) => setV(id, v)} />
                            <span className="text-xs text-ink-soft tabular" dir="ltr">{pctNow ? pctFmt(pctNow[id] ?? 0) : ""}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <ClosedNote className="pt-2" />
            </div>
            {view === "pct" && pctNow && <p className="text-sm text-ink-soft mt-2">אחרות (רשימות שאינן כאן): <span className={`tabular ${pctSum > 100.05 ? "text-warn font-bold" : ""}`}>{pctSum > 100.05 ? `חריגה: ${pctFmt(pctSum)}` : pctFmt(Math.max(0, 100 - pctSum))}</span></p>}
            <CalcAssumptions calc={calc} onChange={setCalc} />
      <ActionBar note={targets.length > 0 ? `השלם הכל מתחשב ביעד ל${targets.map((b) => `${b.name.startsWith("גוש ") ? b.name : `גוש ${b.name}`} ${b.target}`).join(" ול")}` : undefined} above={<>
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
export function HowTo({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <CardDrawer title="איך בונים את הניחוש שלי?" className="c-howto mb-2">
      <ol className="text-sm text-ink list-decimal ps-5 space-y-1">
        <li>מתחילים מאפס, מבחירות 22, מממוצע סקרים או מסקר בודד — מה שנוח לכם.</li>
        <li>נועלים את המספרים שרוצים לשמור, ומשאירים את שאר המפלגות פתוחות לשינויים.</li>
        <li>רוצים? אפשר להגדיר גם יעד מנדטים לגוש משלכם.</li>
        <li>זהו, לוחצים ״השלם הכל״. שאר המפלגות מתעדכנות בהתאם למספרים שנעלתם וליעדי הגושים שהגדרתם.</li>
      </ol>
      <section className="py-3 text-sm" aria-label="שמירה ושיתוף הניחוש">
        <h2 className="font-bold mb-1">שמירה ושיתוף הניחוש</h2>
        <p>{signedIn ? "הניחוש נשמר בחשבון שלכם, ורק האחרון נספר בסקר האתר." : <>הטיוטה נשמרת במכשיר הזה ואפשר לשתף אותה. כדי שתיספר בסקר האתר ותישמר בהיסטוריה, נכנסים לחשבון בזמן השמירה או <Link to="/account">באזור האישי</Link>.</>}</p>
        <p>לאחר השלמת הכנסת אפשר לשתף את הניחוש. גרסאות שנשמרו בחשבון זמינות בכפתור ״היסטוריית ניחושים״ במסך הניחוש.</p>
      </section>
      <details className="group mt-2 border-t border-paper-line [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[40px] text-sm font-bold">
          הסברים
          <span aria-hidden="true" className="text-ink-soft text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-3 text-sm pb-1">
          <div className="flex items-center gap-3"><span className="shrink-0" aria-hidden="true"><LockChip locked /></span><p><b>נעול:</b> המספר שלכם. "השלם הכול" לא ישנה אותו. מספר שמקלידים ננעל מעצמו.</p></div>
          <div className="flex items-center gap-3"><span className="shrink-0" aria-hidden="true"><LockChip locked={false} /></span><p><b>פתוח:</b> "השלם הכול" רשאי לשנות אותו. לחיצה על המנעול נועלת או פותחת.</p></div>
          <p><b>מנדטים או אחוזים:</b> המתג קובע מה מקלידים, והשני מתעדכן לבד. מאחוזים למנדטים — לפי חלוקת המנדטים, כמו בספירה האמיתית. ממנדטים לאחוזים — האחוז שנותן בדיוק את אותם מנדטים; מפלגה עם 0 שומרת על האחוז שלה, מתחת לסף.</p>
          <p><b>אחוז החסימה:</b> מפלגה צריכה לפחות 4 מנדטים כדי להיכנס לכנסת. לכן אין 1, 2 או 3 מנדטים — מעלים ל-4 או מורידים ל-0.</p>
          <p><b>בחירות 22 · סקרים:</b> שני מקורות להשוואה ליד כל מפלגה. "בחירות 22" — לפי השיוך במסך <Link to="/changes">מה השתנה</Link>; "~" = חלק מרשימה שהתפצלה. ממוצע הניחושים מוצג רק בשלב הבא, אחרי השלמת הכנסת. במסך רחב נכתב ליד כל ממוצע גם הטווח (הנמוך–הגבוה בין המכונים או בין הניחושים), כמו בסקר האתר.</p>
        </div>
      </details>
    </CardDrawer>
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
        <p className="text-xs text-ink-soft">ברירת המחדל: {num(registry.k26.eligible)} בעלי זכות (נתון רשמי של ועדת הבחירות), שיעור הצבעה 70%, פסולים 0.6%.</p>
        <fieldset>
          <legend className="font-bold">הסכמי עודפים</legend>
          {AG.map((a) => (
            <label key={a.pair.join()} className="flex items-center gap-2 min-h-[44px]">
              <input type="checkbox" checked={on(a.pair)} onChange={() => onChange({ ...calc, agreements: on(a.pair) ? calc.agreements.filter((x) => x.join() !== a.pair.join()) : [...calc.agreements, [...a.pair]] })} />
              {listName(a.pair[0])} – {listName(a.pair[1])}
              <Badge tone="warn">{a.status === "reported_single_source" ? "דווח במקור יחיד" : "דווח, טרם רשמי"}</Badge>
            </label>
          ))}
          <p className="text-xs text-ink-soft">ההסכמים הרשמיים מוגשים עד 16/10 ומתפרסמים עד 19/10.</p>
        </fieldset>
      </div>
    </details>
  );
}

type CompareKey = "k22" | "polls";
const COMPARE: { id: CompareKey; label: string; long?: string }[] = [{ id: "k22", label: "בחירות 22" }, { id: "polls", label: "סקרים", long: "ממוצע " }];
/** טווח כטקסט (הנמוך–הגבוה), או ריק כשאין טווח או שהנמוך שווה לגבוה — כמו בסקר האתר */
const rangeText = (r: [number, number] | null | undefined, fmt: (x: number) => string) => (r && r[0] !== r[1] ? rng(fmt(r[0]), fmt(r[1])) : "");
/**
 * שורת הכותרות היחידה (הכרעת בעלים 11.10.2026, עודכן 12.10.2026): "בחירות 22", "סקרים" ו"משתתפים" הן כותרות גלויות תמיד, ממורכזות מעל הטור שלהן (לא כפתורים); ליד שם המפלגה — מתג מנדטים | אחוזים,
 * ובצד — כפתור קישור "שיוך בחירות 22".
 */
function CompareHeader({ view, onView, sourceName }: { sourceName: string; view: "seats" | "pct"; onView: (v: "seats" | "pct") => void }) {
  return (
    <div className="seat-head pb-2 border-b-2 border-ink/30">
      <div className="seat-head-mode">
        <Segmented size="sm" label="מה מקלידים" value={view} onChange={onView} className="!inline-grid w-auto text-xs" options={[{ id: "seats", label: "מנדטים" }, { id: "pct", label: "אחוזים" }]} />
      </div>
      <div role="row" className="seat-head-chips flex">
        {COMPARE.map((c) => (
          <span key={c.id} role="columnheader" className="w-[var(--cw)] shrink-0 flex justify-center text-xs font-bold text-ink whitespace-nowrap">
            <span className="truncate max-w-full" title={c.id === "polls" ? sourceName : c.label}>{c.id === "polls" ? sourceName : <>{c.long && <span className="cmp-long">{c.long}</span>}{c.label}</>}</span>
          </span>
        ))}
      </div>
      <Link to="/changes" aria-label="שיוך בחירות 22" className="seat-head-link inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-full border-2 border-ink text-xs font-bold text-ink no-underline hover:bg-paper">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></svg>
        <span><span className="seat-link-long">שיוך </span>בחירות 22</span>
      </Link>
    </div>
  );
}
/**
 * שלושה מספרים בטורים קבועים — מתחת לשם המפלגה, מיושרים לכותרת שמעל הרשימה. המספר בגופן 14px; כשיש מקום ברוחב (50rem ומעלה) הטווח (הנמוך–הגבוה) לידו בגופן קטן, כמו בסקר האתר.
 */
function CompareCells({ cells, sourceName }: { sourceName: string; cells: Record<CompareKey, { mean: ReactNode; range?: string }> }) {
  return (
    <span className="flex mt-0.5">
      {COMPARE.map((c) => (
        <span key={c.id} className="w-[var(--cw)] shrink-0 px-1.5 border-s border-paper-line first:border-s-0 font-num tabular text-ink-soft flex items-baseline justify-center gap-1.5 whitespace-nowrap overflow-hidden">
          <span className="sr-only">{c.id === "polls" ? sourceName : c.label}: </span>
          <bdi dir="ltr" className="text-sm leading-tight">{cells[c.id].mean}</bdi>
          {cells[c.id].range ? <bdi dir="ltr" className="cmp-range text-xs leading-tight">{cells[c.id].range}</bdi> : null}
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
          <p className="text-xs text-ink-soft mb-3">לפי חלק כל רשימה במקור שנבחר מ-{date(POLLS_AS_OF)}; רשימה שבממוצע מתחת לסף מקבלת 0. נעולים לא זזו.</p>
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
