import { useEffect, useRef, useState } from "react";
import type { SeatsPayload, VotePayload } from "../../lib/crowdApi";
import { seatsSum, validateSeats } from "../../lib/crowdValidate";
import { SIMPLE_GUESS_HIDDEN, simpleValue } from "../../lib/simpleSources";
import { IDS, startSeats, nameOf } from "../guess/model";
import { flushUnit, useSession, useUnit } from "../guess/useCrowd";
import { AuthSheet, SaveError } from "../guess/SaveButton";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import ShareCard from "./ShareCard";
import Vote from "../guess/Vote";
import CardDrawer from "../../components/CardDrawer";
import { Notice } from "../guess/ui";
import { BlocChart, FocusFoot, flashNotice, PartyName, SourceBar, fmt, useSimpleSource } from "./shared";
import { useHagzara } from "./hagzara";
const EMPTY = startSeats("zero");
/** הכנסת שלי: עורך ידני מול טור ממוצע נבחר, גושים חיים ("חסר" עד 120), מגירת ההצבעה ושיתוף אחרי שמירה */
const SHARE_OFFERED = "elections26.shareOffered";
export default function SimpleGuess() {
  const session = useSession();
  const source = useSimpleSource();
  const hagzara = useHagzara(session);
  const unit = useUnit<SeatsPayload>("seats", EMPTY, session.me?.latest.seats?.payload as SeatsPayload | undefined);
  const vote = useUnit<VotePayload>("vote", null, session.me?.latest.vote?.payload as VotePayload | undefined);
  const [voteOpen, setVoteOpen] = useState(false);
  const draft = unit.draft ?? EMPTY;
  const total = seatsSum(draft);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const invalidInput = !!editing && (!/^\d+$/.test(editing.text) || Number(editing.text) > 120);
  const invalid = invalidInput ? "הזינו מספר שלם בין 0 ל־120." : validateSeats(draft, IDS);
  const ref = (id: string) => simpleValue(source.selection, [id]);
  const order = IDS.filter(id => !SIMPLE_GUESS_HIDDEN.includes(id) || (draft.seats[id]?.v ?? 0) > 0).sort((a, b) => (ref(b) ?? 0) - (ref(a) ?? 0));
  // רשימה שכבר אינה מתמודדת (טיוטה או שמירה ישנה) ⇐ יוצאת מהטיוטה, והמנדטים שלה חוזרים לחלוקה; אחרת "רשימה לא מוכרת" בלי שאפשר לראות למה
  const stale = Object.keys(draft.seats).filter(id => !IDS.includes(id));
  useEffect(() => {
    if (!stale.length) return;
    unit.setDraft({ ...draft, seats: Object.fromEntries(Object.entries(draft.seats).filter(([id]) => IDS.includes(id))) });
  }, [stale.join()]);
  /*
   * יציאה מהמסך (הכרעת בעלים 24.10.2026) — בלי כפתור שמירה; הניחוש נשמר ביציאה:
   * 0 מנדטים ⇐ כלום · חלקי ⇐ "האם אתה בטוח" · 120 ומחובר ⇐ פעם אחת חלון שיתוף · 120 ולא מחובר ⇐ חלון "להתחבר ולשמור או לשתף"
   */
  const navigate = useNavigate();
  const [exit, setExit] = useState<{ to: string; step: "ask" | "share" | "auth" } | null>(null);
  const stateRef = useRef({ total, invalid, token: session.token });
  stateRef.current = { total, invalid, token: session.token };
  const leave = (to: string) => { setExit(null); navigate(to); };
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      const href = a?.getAttribute("href") ?? "";
      const { total: t, invalid: bad, token } = stateRef.current;
      if (!href.startsWith("#/") || href.startsWith("#/guess") || t <= 0) return;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (t < 120 || bad) { if (!window.confirm(t < 120 ? "האם אתה בטוח לצאת לפני שהשלמת ל־120?" : `הניחוש עוד לא תקין (${bad}). לצאת בכל זאת?`)) stop(); return; }
      if (token) { if (localStorage.getItem(SHARE_OFFERED)) return; try { localStorage.setItem(SHARE_OFFERED, "1"); } catch { /* בלי אחסון — יוצע שוב */ } }
      stop();
      flushUnit("seats");
      setExit({ to: href.slice(1), step: token ? "share" : "ask" });
    };
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); flushUnit("seats"); };
  }, []);
  const change = (id: string, next: number) => {
    // אי אפשר לעבור את 120 יחד (הכרעת בעלים 24.10.2026): התוספת נעצרת במה שנשאר לחלוקה
    const cur = draft.seats[id]?.v ?? 0;
    const v = Math.max(0, Math.min(next, cur + Math.max(0, 120 - total)));
    if (next > cur && v < next) flashNotice("הגעתם ל־120 מנדטים");
    if (v === cur) return v;
    // עריכה במנדטים מחליפה קלט אחוזים רק אחרי שינוי מפורש; יתר התאים והנעילות נשמרים.
    const { pct: _pct, calculation: _calculation, ...rest } = draft;
    unit.setDraft({ ...rest, mode: "seats", seats: { ...draft.seats, [id]: { ...draft.seats[id], v, src: "manual", locked: draft.seats[id]?.locked ?? false } } });
    return v;
  };
  useEffect(() => { void session.refresh(); }, [session.refresh]);
  const hagzaraLogo = hagzara?.logoUrl ?? null;
  const values = Object.fromEntries(IDS.map(id => [id, draft.seats[id]?.v ?? 0]));
  return <div className="max-w-6xl mx-auto"><h1 className="sr-only">הכנסת שלי</h1><SourceBar source={source} />
    <div className="f-grid"><div className="f-card">
      {order.map(id => {
        const value = draft.seats[id]?.v ?? 0, bad = value > 0 && value < 4, inputBad = editing?.id === id && invalidInput;
        return <div key={id} className="f-edit"><div className="min-w-0"><PartyName id={id} /><div className="f-ref font-num">ממוצע {fmt(ref(id))}</div>
          {inputBad && <span className="text-xs text-warn">0 עד 120</span>}{bad && <span className="text-xs text-warn">0 או לפחות 4</span>}</div>
          <div className="f-step">
            <button type="button" aria-label={`הפחתת מנדט ל${nameOf(id)}`} disabled={value <= 0} onClick={() => { setEditing(null); change(id, value - 1); }}>−</button>
            <input aria-label={`מנדטים ל${nameOf(id)}`} aria-invalid={bad || inputBad || undefined} inputMode="numeric" type="text" value={editing?.id === id ? editing.text : value} onChange={e => { const text = e.target.value; setEditing({ id, text }); if (/^\d+$/.test(text) && Number(text) <= 120) { const v = change(id, Number(text)); if (v !== Number(text)) setEditing({ id, text: String(v) }); } }} onBlur={() => { if (!invalidInput) setEditing(null); }} />
            <button type="button" aria-label={`הוספת מנדט ל${nameOf(id)}`} aria-disabled={total >= 120 || undefined} onClick={() => { setEditing(null); change(id, value + 1); }}>+</button>
          </div></div>;
      })}
      <SaveError unit={unit} />{unit.queued && <Notice>ההשערה שמורה במכשיר וממתינה לאישור השרת.</Notice>}
      {total === 120 && invalid && <p className="text-sm text-warn mt-3">{invalid}</p>}
      {total > 120 && <p className="text-sm text-warn mt-3">יש {total - 120} מנדטים יותר מדי.</p>}
    </div>
    <div className="f-side"><BlocChart values={values} missing={Math.max(0, 120 - total)} logo={hagzaraLogo} />
      <CardDrawer title="ההצבעה שלי" open={voteOpen} onOpenChange={v => { setVoteOpen(v); if (!v) flushUnit("vote"); }} seenId="vote" className="mt-5"><Vote unit={vote} session={session} /></CardDrawer></div></div>
    <FocusFoot />
    {exit?.step === "share" && <ShareCard heading={session.token ? "הכנסת שלך נשמרה! לשתף?" : "לשתף את הכנסת שלך?"} input={{ kind: "mine", values, name: session.me?.username, group: hagzara }} onClose={() => leave(exit.to)} />}
    {exit?.step === "auth" && createPortal(<AuthSheet session={session} onClose={() => setExit({ ...exit, step: "ask" })} onDone={async token => { await unit.save(token); leave(exit.to); }} />, document.body)}
    {exit?.step === "ask" && createPortal(<div className="f-modal" onClick={e => e.target === e.currentTarget && setExit(null)} onKeyDown={e => e.key === "Escape" && setExit(null)}>
      <div role="dialog" aria-modal="true" aria-labelledby="f-exit-title" tabIndex={-1}>
        <h2 id="f-exit-title" className="text-lg font-bold">הכנסת שלך מוכנה</h2>
        <p className="text-sm text-ink-soft">כדי שהניחוש יישמר וייספר בממוצע, מתחברים. אפשר גם רק לשתף.</p>
        <button type="button" className="f-btn pri" onClick={() => setExit({ ...exit, step: "auth" })}>להתחבר ולשמור</button>
        <button type="button" className="f-btn" onClick={() => setExit({ ...exit, step: "share" })}>לשתף</button>
        <button type="button" className="f-btn" onClick={() => leave(exit.to)}>להמשיך בלי לשמור</button>
      </div></div>, document.body)}
  </div>;
}
