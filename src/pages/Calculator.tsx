import PersonalBlocs from "../components/PersonalBlocs";
import SaveButton, { SaveError, type SaveUnit } from "./guess/SaveButton";
import { setExitSave, type useSession, type useUnit } from "./guess/useCrowd";
import { getToken } from "../lib/crowdSession";
import { ActionBar, Btn } from "./guess/ui";
import type { SeatsPayload, BlocsPayload } from "../lib/crowdApi";
import { validateBlocs, validateSeats } from "../lib/crowdValidate";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Explained from "../components/Explained";
import { Badge, Card, Fold, Note, PageTitle } from "../components/ui";
import { allocate, votesToNextSeat, type Agreement } from "../engine/baderOfer";
import { lastPollDate, latestPerPollster, lists2026, listName, mean, meta, passesInMost, registry, summarize } from "../lib/data";
import { dateLong, num, pct } from "../lib/format";
import { DEFAULT_TURNOUT, sharesToVotes, validVotes } from "../lib/lawSeats";

const IDS = lists2026.map((l) => l.id);
const OTHERS_DEFAULT = 1.5;

/** נקודת המוצא: ממוצע המנדטים בסקרים האחרונים, מומר לאחוזים בקירוב שמתחשב בבאדר-עופר. שנו כרצונכם. */
function startingShares(): Record<string, number> {
  const latest = latestPerPollster(lastPollDate(), 14);
  const sum = summarize(latest, IDS);
  const shares: Record<string, number> = {};
  let below = 0;
  for (const s of sum) {
    if (!passesInMost(s)) {
      const ps = latest.map((p) => p.values[s.id]?.p).filter((x): x is number => typeof x === "number");
      shares[s.id] = ps.length ? Math.round(mean(ps) * 10) / 10 : 1;
      below += shares[s.id];
    }
  }
  const above = sum.filter(passesInMost);
  const weight = above.reduce((a, s) => a + s.mean + 0.5, 0);
  const room = 100 - below - OTHERS_DEFAULT;
  for (const s of above) shares[s.id] = Math.round(((s.mean + 0.5) / weight) * room * 10) / 10;
  for (const id of IDS) if (!(id in shares)) shares[id] = 0;
  return shares;
}

const AGREEMENTS = meta.agreements2026;

function encode(shares: Record<string, number>, turnout: number, eligible: number, ag: boolean[]) {
  return {
    cs: IDS.map((id) => shares[id] ?? 0).join("_"),
    ct: String(turnout),
    ce: String(eligible),
    ca: ag.map((x) => (x ? "1" : "0")).join(""),
  };
}

export default function Calculator({ session, unit, blocsUnit }: { session: ReturnType<typeof useSession>; unit: ReturnType<typeof useUnit<SeatsPayload>>; blocsUnit: ReturnType<typeof useUnit<BlocsPayload>> }) {
  const [params, setParams] = useSearchParams();
  const initial = useMemo(() => {
    const def = startingShares();
    const stored = unit.draft?.calculation;
    const s = params.get("cs")?.split("_").map(Number);
    // קישור שנוצר לפני שנוספו רשימות קצר יותר: הרשימות החדשות מתחילות ב-0
    const shares = s && s.length >= 1 && s.length <= IDS.length && s.every((x) => Number.isFinite(x) && x >= 0 && x <= 100 && Math.abs(x * 10 - Math.round(x * 10)) < 1e-6) ? Object.fromEntries(IDS.map((id, i) => [id, s[i] ?? 0])) : unit.draft?.mode === "pct" && unit.draft.pct ? unit.draft.pct : def;
    return {
      shares,
      turnout: Number(params.get("ct")) || stored?.turnout || DEFAULT_TURNOUT,
      eligible: Number(params.get("ce")) || stored?.eligible || registry.k26.eligible,
      ag: params.get("ca")?.length === AGREEMENTS.length ? [...params.get("ca")!].map((c) => c === "1") : AGREEMENTS.map(a => stored ? stored.agreements.some(pair => pair.join() === a.pair.join()) : true),
      def,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [shares, setShares] = useState<Record<string, number>>(initial.shares);
  const [turnout, setTurnout] = useState(initial.turnout);
  const [eligible, setEligible] = useState(initial.eligible);
  const [ag, setAg] = useState<boolean[]>(initial.ag);
  const touched = useRef(false);
  useEffect(() => {
    const saved = unit.draft;
    if (touched.current || params.has("cs") || saved?.mode !== "pct" || !saved.pct) return;
    setShares(saved.pct);
    if (saved.calculation) {
      setTurnout(saved.calculation.turnout); setEligible(saved.calculation.eligible);
      setAg(AGREEMENTS.map(a => saved.calculation!.agreements.some(pair => pair.join() === a.pair.join())));
    }
  }, [unit.draft]);
  const [nextSeat, setNextSeat] = useState<Record<string, number | null>>({});

  const sync = (s = shares, t = turnout, e = eligible, a = ag) => { touched.current = true; const next = new URLSearchParams(params); for (const [k, v] of Object.entries(encode(s, t, e, a))) next.set(k, v); setParams(next, { replace: true }); };

  const listSum = IDS.reduce((a, id) => a + (shares[id] || 0), 0);
  const others = Math.max(0, 100 - listSum);
  const over = listSum > 100.0001;
  const valid = validVotes(eligible, turnout);
  const votes = sharesToVotes(IDS, shares, valid);
  const agreements: Agreement[] = AGREEMENTS.filter((_, i) => ag[i]).map((a) => a.pair as unknown as Agreement);
  const r = useMemo(() => over ? null : allocate(votes, valid, agreements), [shares, turnout, eligible, ag]);
  const r0 = over ? null : allocate(votes, valid, []);

  const inputProblem = !Number.isFinite(eligible) || eligible <= 0 || eligible > 100000000 || !Number.isFinite(turnout) || turnout <= 0 || turnout > 100 ? "בעלי זכות בחירה חייבים להיות חיוביים; שיעור הצבעה בין 0 ל־100." : null;
  const next: SeatsPayload | null = inputProblem || r?.status !== "ok" ? null : {
    mode: "pct", pct: shares, start: "polls", pollsAsOf: lastPollDate(),
    seats: Object.fromEntries(IDS.map(id => [id, { v: r.seats[id] ?? 0, src: "manual" as const, locked: true }])),
    calculation: { turnout, eligible, agreements: agreements.map(pair => [...pair]) },
  };
  const saveUnit: SaveUnit = {
    status: JSON.stringify(next) === JSON.stringify(unit.saved) ? blocsUnit.status : unit.saved ? "dirty" : "draft",
    state: unit.state === "saving" || blocsUnit.state === "saving" ? "saving" : unit.state === "error" || blocsUnit.state === "error" ? "error" : "idle",
    error: unit.error ?? blocsUnit.error, errorLog: unit.errorLog ?? blocsUnit.errorLog,
    save: async token => { if (!next) return false; unit.setDraft(next); if (!await unit.save(token, next)) return false; return blocsUnit.status === "saved" || await blocsUnit.save(token); },
  };
  const invalid = inputProblem ?? (over ? "סכום האחוזים עולה על 100." : r?.status !== "ok" ? "אפשר לשמור רק תוצאה תקינה של 120 מנדטים, ללא הגרלה." : null) ?? (next ? validateSeats(next, IDS) : null) ?? (blocsUnit.draft ? validateBlocs(blocsUnit.draft, IDS) : null);

  // יציאה מהמסך אחרי שינוי בקלט ⇐ התוצאה נשמרת כמו בלחיצה על "שמור" (הכרעת בעלים 10.10.2026)
  const exitSave = useRef(saveUnit);
  const invalidRef = useRef(invalid);
  invalidRef.current = invalid;
  exitSave.current = saveUnit;
  const dirty = touched.current && !invalid && saveUnit.status !== "saved";
  useEffect(() => {
    if (!dirty) return;
    setExitSave("seats", () => { setExitSave("seats", null); const t = getToken(); if (t && exitSave.current.status !== "saved" && !invalidRef.current) void exitSave.current.save(t); });
  }, [dirty, shares, turnout, eligible, ag]);

  const setAll = (next: Record<string, number>) => { setShares(next); setNextSeat({}); sync(next); };
  /** "השלם הכול": רשימות שעומדות על 0 מקבלות את נקודת המוצא מהסקרים, מוקטנת כך שהסכום לא יעבור את 100 (פחות "אחרות" 1.5%) */
  const fillAllShares = () => {
    const empty = IDS.filter((id) => !(shares[id] > 0) && initial.def[id] > 0);
    const want = empty.reduce((a, id) => a + initial.def[id], 0);
    const room = Math.max(0, 100 - OTHERS_DEFAULT - listSum);
    if (!empty.length || !room) return;
    const k = Math.min(1, room / want);
    setAll({ ...shares, ...Object.fromEntries(empty.map((id) => [id, Math.floor(initial.def[id] * k * 10) / 10])) });
  };

  const setShare = (id: string, v: number) => {
    const next = { ...shares, [id]: Math.max(0, Math.min(100, Math.round(v * 10) / 10)) };
    setShares(next);
    setNextSeat({});
    sync(next);
  };

  return (
    <>
      <PageTitle lead="מכניסים אחוזי הצבעה לכל רשימה (מתוך הקולות הכשרים), והמחשבון מחלק 120 מנדטים לפי חוק הבחירות: אחוז החסימה, הסכמי העודפים ושיטת באדר-עופר. המנוע נבדק מול חמש מערכות הבחירות 2019–2022 ומשחזר אותן בדיוק.">
        מחשבון ההשערה
      </PageTitle>
            {r?.status === "ok" && <PersonalBlocs title="הגושים שלי לפי תוצאת המחשבון" values={r.seats} source="תוצאת מחשבון ההשערה לפי חוק הבחירות" asOf="מחושב עכשיו מהקלט שלכם" />}

      <div className="mb-4">{invalid && <p role="status" className="text-sm text-warn mb-2">{invalid}</p>}<p className="text-sm text-ink-soft">שמירת התוצאה מעדכנת את השערת המנדטים והגושים שלכם בחשבון ובהיסטוריה. השמירה נעשית בלחיצה על ״שמור״, או ביציאה מהמסך אחרי שינוי בקלט.</p></div>
      <ActionBar above={saveUnit.error && <div className="bg-paper-card rounded-theme"><SaveError unit={saveUnit} /></div>}>
        <Btn onClick={() => setAll(Object.fromEntries(IDS.map((id) => [id, 0])))}>אפס הכול</Btn>
        <Btn onClick={fillAllShares}>השלם הכול</Btn>
        <SaveButton unit={saveUnit} session={session} invalid={invalid} compact />
      </ActionBar>
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5 [&>*]:min-w-0">
        <Card title="הקלט" boxed>
          <p className="text-sm text-ink-soft mb-3">
            נקודת המוצא: ממוצע הסקרים האחרונים (עד {dateLong(lastPollDate())}), מומר לאחוזים בקירוב. זו הערכה גסה — שנו כרצונכם.
          </p>
          <table className="w-full text-sm">
            <caption className="sr-only">אחוז לכל רשימה</caption>
            <thead>
              <tr className="text-right border-b border-paper-line">
                <th scope="col" className="py-1">רשימה</th>
                <th scope="col">אחוז מהכשרים</th>
              </tr>
            </thead>
            <tbody>
              {IDS.map((id) => (
                <tr key={id} className="border-b border-paper-line/60">
                  <th scope="row" className="text-right font-medium py-1">
                    <label htmlFor={`share-${id}`}>{listName(id)}</label>
                  </th>
                  <td>
                    <input
                      id={`share-${id}`}
                      type="number"
                      inputMode="decimal"
                      step={0.1}
                      min={0}
                      max={100}
                      value={shares[id] ?? 0}
                      onChange={(e) => setShare(id, Number(e.target.value))}
                      className="w-24 border border-paper-line rounded px-2 py-1 tabular-nums"
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="text-right py-1 text-ink-soft">אחרות (מחושב)</th>
                <td className={`tabular-nums ${over ? "text-warn font-bold" : ""}`}>{over ? `חריגה: ${pct(listSum)}` : pct(others)}</td>
              </tr>
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <label className="text-sm flex flex-col">
              בעלי זכות בחירה
              <input type="number" step={10000} value={eligible} onChange={(e) => { const v = Number(e.target.value) || 0; setEligible(v); sync(shares, turnout, v); }} className="border border-paper-line rounded px-2 py-1 mt-1 tabular-nums" />
            </label>
            <label className="text-sm flex flex-col">
              שיעור הצבעה (%)
              <input type="number" step={0.5} min={40} max={90} value={turnout} onChange={(e) => { const v = Number(e.target.value) || 0; setTurnout(v); sync(shares, v); }} className="border border-paper-line rounded px-2 py-1 mt-1 tabular-nums" />
            </label>
          </div>
          <Note>
            ברירת המחדל: {num(registry.k26.eligible)} בעלי זכות — מספר שדווח בתקשורת וטרם אומת מול פרסום רשמי. פסולים: 0.6% (כמו בבחירות
            האחרונות). סך הקולות הכשרים בתרחיש: <strong>{num(valid)}</strong>.
          </Note>
          <fieldset className="mt-4">
            <legend className="text-sm font-bold">הסכמי עודפים</legend>
            {AGREEMENTS.map((a, i) => (
              <label key={a.pair.join()} className="flex items-center gap-2 text-sm mt-1">
                <input
                  type="checkbox"
                  checked={ag[i]}
                  onChange={() => {
                    const next = ag.map((x, j) => (j === i ? !x : x));
                    setAg(next);
                    setNextSeat({});
                    sync(shares, turnout, eligible, next);
                  }}
                />
                {listName(a.pair[0])} – {listName(a.pair[1])}
                <Badge tone="warn">{a.status === "reported_single_source" ? "דווח במקור יחיד" : "דווח, טרם רשמי"}</Badge>
              </label>
            ))}
            <Note>ההסכמים הרשמיים מוגשים לוועדה עד 16.10.2026 ומתפרסמים עד 19.10.2026.</Note>
          </fieldset>
          <button type="button" className="mt-4 border border-paper-line rounded px-3 py-2 text-sm" onClick={() => { setShares(initial.def); setNextSeat({}); sync(initial.def); }}>
            חזרה לנקודת המוצא
          </button>
        </Card>

        <div>
          <Card title="התוצאה">
            {over && <p className="text-warn font-bold">סכום האחוזים עולה על 100 — יש להקטין אחת הרשימות.</p>}
            {r && r.status === "invalid_input" && <p className="text-warn font-bold">{r.error}</p>}
            {r && r.status === "lottery_required" && <p className="text-warn font-bold">שוויון מנות מדויק — לפי החוק מכריעה הגרלה של ועדת הבחירות.</p>}
            {r && r0 && r.status !== "invalid_input" && (
              <Explained
                kind="חישוב לפי החוק"
                source="חוק הבחירות לכנסת, סעיפים 81–82; המנוע נבדק מול תוצאות 2019–2022"
                asOf="מחושב עכשיו מהקלט שלכם"
                assumption="האחוזים הם מתוך הקולות הכשרים. 'בלי הסכמים' = אותה חלוקה בלי אף הסכם עודפים."
                methodAnchor="engine"
                details={
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">מנדטים לכל רשימה</caption>
                  <thead>
                    <tr className="text-right border-b border-paper-line">
                      <th scope="col" className="py-1">רשימה</th>
                      <th scope="col">קולות</th>
                      <th scope="col">מנדטים</th>
                      <th scope="col">בלי הסכמים</th>
                      <th scope="col">קולות למנדט הבא</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...IDS].sort((a, b) => (r.seats[b] ?? 0) - (r.seats[a] ?? 0) || votes[b] - votes[a]).map((id) => {
                      const passed = r.passing.includes(id);
                      const d = (r.seats[id] ?? 0) - (r0.seats[id] ?? 0);
                      return (
                        <tr key={id} className="border-b border-paper-line/60">
                          <th scope="row" className="text-right py-1 font-medium">
                            {listName(id)} {!passed && votes[id] > 0 && <Badge tone="warn">מתחת לסף</Badge>}
                          </th>
                          <td className="tabular-nums">{num(votes[id])}</td>
                          <td className="tabular-nums font-bold">{r.seats[id] ?? 0}</td>
                          <td className="tabular-nums">
                            {r0.seats[id] ?? 0}
                            {d !== 0 && <span className={d > 0 ? "text-accent" : "text-warn"}> (<bdi dir="ltr">{d > 0 ? `+${d}` : d}</bdi>)</span>}
                          </td>
                          <td className="tabular-nums">
                            {passed ? (
                              id in nextSeat ? (
                                nextSeat[id] === null ? "—" : num(nextSeat[id]!)
                              ) : (
                                <button type="button" className="underline text-accent" onClick={() => setNextSeat((m) => ({ ...m, [id]: votesToNextSeat(votes, valid, id, agreements) }))}>
                                  חישוב
                                </button>
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                }
              >
                <table className="w-full text-sm">
                  <thead><tr className="text-start border-b border-paper-line"><th className="py-1">רשימה</th><th>מנדטים</th></tr></thead>
                  <tbody>{[...IDS].sort((a, b) => (r.seats[b] ?? 0) - (r.seats[a] ?? 0) || votes[b] - votes[a]).map((id) => <tr key={id} className="border-b border-paper-line/60"><th className="text-start py-1 font-medium">{listName(id)} {!r.passing.includes(id) && votes[id] > 0 && <Badge tone="warn">מתחת לסף</Badge>}</th><td className="tabular-nums font-bold">{r.seats[id] ?? 0}</td></tr>)}</tbody>
                </table>
              </Explained>
            )}
            {r && r.status !== "invalid_input" && (
              <Fold title="פרטי החישוב"><dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-4">
                <dt className="text-ink-soft">אחוז החסימה בקולות</dt>
                <dd className="tabular-nums">{num(r.thresholdVotes)}</dd>
                <dt className="text-ink-soft">המודד (קולות למנדט שלם)</dt>
                <dd className="tabular-nums">{num(r.quota)}</dd>
                <dt className="text-ink-soft">קולות לרשימות שלא עברו</dt>
                <dd className="tabular-nums">
                  {num(r.wasted)} ({pct((r.wasted / valid) * 100)})
                </dd>
              </dl></Fold>
            )}
            {r && r.inactiveAgreements.length > 0 && (
              <Note>הסכמים שאינם פעילים: {r.inactiveAgreements.map((x) => `${listName(x.pair[0])}–${listName(x.pair[1])} (${x.reason.replace(/[a-z_]+/g, (m) => listName(m))})`).join(" · ")}</Note>
            )}
            <details className="text-sm mt-2"><summary className="cursor-pointer min-h-[44px] flex items-center">על קולות למנדט הבא</summary><Note>"קולות למנדט הבא" = כמה קולות צריך להוסיף לרשימה, כשכל השאר נשארות קבועות, כדי שתקבל מנדט נוסף (אחוז החסימה והמודד זזים בהתאם).</Note></details>
          </Card>

          {r && r.status === "ok" && (
            <Fold title="צעד אחר צעד: חלוקת המנדטים העודפים">
              <p className="text-sm mb-2">
                שלב 1: כל רשימה שעברה מקבלת מנדט שלם לכל {num(r.quota)} קולות ({Object.values(r.whole).reduce((a, b) => a + b, 0)} מנדטים). שלב 2: את
                {" "}
                {r.trace.length} הנותרים מקבלת בכל פעם הרשימה (או זוג העודפים) עם המנה הגבוהה ביותר — קולות חלקי (מנדטים + 1):
              </p>
              <ol className="text-sm list-decimal ps-6 space-y-0.5">
                {r.trace.map((t) => (
                  <li key={t.step}>
                    {t.unit.split("+").map((x) => listName(x)).join(" + ")} — מנה {num(t.quotient)}
                  </li>
                ))}
              </ol>
              <Note>מנדט שזכה בו זוג עודפים מתחלק אחר כך בין שתי הרשימות באותה שיטה (סעיף 82(ב) לחוק).</Note>
            </Fold>
          )}
        </div>
      </div>
    </>
  );
}
