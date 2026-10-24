import { useEffect, useState } from "react";
import type { SeatsPayload, VotePayload } from "../../lib/crowdApi";
import { seatsSum, validateSeats } from "../../lib/crowdValidate";
import { SIMPLE_GUESS_HIDDEN, simpleValue } from "../../lib/simpleSources";
import { IDS, startSeats, nameOf } from "../guess/model";
import { flushUnit, useSession, useUnit } from "../guess/useCrowd";
import SaveButton, { SaveError } from "../guess/SaveButton";
import Vote from "../guess/Vote";
import CardDrawer from "../../components/CardDrawer";
import { Notice } from "../guess/ui";
import { BlocChart, FocusFoot, PartyName, SourceBar, fmt, useSimpleSource } from "./shared";
import ShareCard from "./ShareCard";
import { useHagzara } from "./hagzara";
const EMPTY = startSeats("zero");
/** הכנסת שלי: עורך ידני מול טור ממוצע נבחר, גושים חיים ("חסר" עד 120), מגירת ההצבעה ושיתוף אחרי שמירה */
export default function SimpleGuess() {
  const session = useSession();
  const source = useSimpleSource();
  const hagzara = useHagzara(session);
  const unit = useUnit<SeatsPayload>("seats", EMPTY, session.me?.latest.seats?.payload as SeatsPayload | undefined, { exitSave: false });
  const vote = useUnit<VotePayload>("vote", null, session.me?.latest.vote?.payload as VotePayload | undefined);
  const [voteOpen, setVoteOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const draft = unit.draft ?? EMPTY;
  const total = seatsSum(draft);
  const firstName = (session.me?.name ?? "").trim().split(/\s+/)[0];
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const invalidInput = !!editing && (!/^\d+$/.test(editing.text) || Number(editing.text) > 120);
  const invalid = invalidInput ? "הזינו מספר שלם בין 0 ל־120." : validateSeats(draft, IDS);
  const ref = (id: string) => simpleValue(source.selection, [id]);
  const order = IDS.filter(id => !SIMPLE_GUESS_HIDDEN.includes(id) || (draft.seats[id]?.v ?? 0) > 0).sort((a, b) => (ref(b) ?? 0) - (ref(a) ?? 0));
  const change = (id: string, v: number) => {
    // עריכה במנדטים מחליפה קלט אחוזים רק אחרי שינוי מפורש; יתר התאים והנעילות נשמרים.
    const { pct: _pct, calculation: _calculation, ...rest } = draft;
    unit.setDraft({ ...rest, mode: "seats", seats: { ...draft.seats, [id]: { ...draft.seats[id], v, src: "manual", locked: draft.seats[id]?.locked ?? false } } });
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
            <input aria-label={`מנדטים ל${nameOf(id)}`} aria-invalid={bad || inputBad || undefined} inputMode="numeric" type="text" value={editing?.id === id ? editing.text : value} onChange={e => { const text = e.target.value; setEditing({ id, text }); if (/^\d+$/.test(text) && Number(text) <= 120) change(id, Number(text)); }} onBlur={() => { if (!invalidInput) setEditing(null); }} />
            <button type="button" aria-label={`הוספת מנדט ל${nameOf(id)}`} disabled={value >= 120} onClick={() => { setEditing(null); change(id, value + 1); }}>+</button>
          </div></div>;
      })}
      <SaveError unit={unit} />{unit.queued && <Notice>ההשערה שמורה במכשיר וממתינה לאישור השרת.</Notice>}
      {total === 120 && invalid && <p className="text-sm text-warn mt-3">{invalid}</p>}
      {total > 120 && <p className="text-sm text-warn mt-3">יש {total - 120} מנדטים יותר מדי.</p>}
      {/* כפתור שמירה צף — רק כשכל 120 המושבים חולקו (הכרעת בעלים 24.10.2026) */}
      {total === 120 ? <div className="f-save-float"><SaveButton unit={unit} session={session} invalid={invalid} compact label={`לשמור את הניחוש ${firstName ? `של ${firstName}` : "שלי"}`} onSaved={() => setSharing(true)} /></div>
        : <div className="flex justify-end mt-4"><SaveButton unit={unit} session={session} invalid={invalid} compact onSaved={() => setSharing(true)} /></div>}
    </div>
    <div className="f-side"><BlocChart values={values} missing={Math.max(0, 120 - total)} logo={hagzaraLogo} />
      <CardDrawer title="ההצבעה שלי" open={voteOpen} onOpenChange={v => { setVoteOpen(v); if (!v) flushUnit("vote"); }} seenId="vote" className="mt-5"><Vote unit={vote} session={session} /></CardDrawer></div></div>
    <FocusFoot />
    {sharing && <ShareCard heading="נשמר! לשתף את הכנסת שלך?" input={{ kind: "mine", values, name: session.me?.username, group: hagzara }} onClose={() => setSharing(false)} />}
  </div>;
}
