import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../../components/ui";
import type { SeatsPayload } from "../../lib/crowdApi";
import { seatsSum, validateSeats } from "../../lib/crowdValidate";
import { SIMPLE_ALL, SIMPLE_14_24, simpleValue } from "../../lib/simpleSources";
import { IDS, DEFAULT_BLOCS, startSeats, nameOf } from "../guess/model";
import { useSession, useUnit } from "../guess/useCrowd";
import SaveButton, { SaveError } from "../guess/SaveButton";
import { ActionBar, Notice } from "../guess/ui";
import { PartyName, PollExplanation, SimpleFooter, SimpleTable, number } from "./shared";
const EMPTY = startSeats("zero");
export default function SimpleGuess() {
  const session = useSession();
  const unit = useUnit<SeatsPayload>("seats", EMPTY, session.me?.latest.seats?.payload as SeatsPayload | undefined, { exitSave: false });
  const draft = unit.draft ?? EMPTY;
  const total = seatsSum(draft);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const invalidInput = !!editing && (!/^\d+$/.test(editing.text) || Number(editing.text) > 120);
  const invalid = invalidInput ? "הזינו מספר שלם בין 0 ל־120." : validateSeats(draft, IDS);
  const order = [...IDS].sort((a, b) => (simpleValue(SIMPLE_ALL, [b]) ?? 0) - (simpleValue(SIMPLE_ALL, [a]) ?? 0));
  const change = (id: string, v: number) => {
    // עריכה במנדטים מחליפה קלט אחוזים רק אחרי שינוי מפורש; יתר התאים והנעילות נשמרים.
    const { pct: _pct, calculation: _calculation, ...rest } = draft;
    unit.setDraft({ ...rest, mode: "seats", seats: { ...draft.seats, [id]: { ...draft.seats[id], v, src: "manual", locked: draft.seats[id]?.locked ?? false } } });
  };
  useEffect(() => { void session.refresh(); }, [session.refresh]);
  return <div className="simple-page max-w-4xl mx-auto"><PageTitle lead="ממלאים את המנדטים עד שמגיעים ל־120.">הכנסת שלי</PageTitle>
    <PollExplanation><SimpleTable editor label="בניית הכנסת שלי" headers={[<span title="ממוצע כל הסקרים">ממוצע סקרים</span>, <span title="ממוצע סקרי ערוץ 14 ו־i24 בלבד">14 ו־i24</span>, "שלי"]} rows={order.map(id => {
      const value = draft.seats[id]?.v ?? 0;
      const bad = value > 0 && value < 4;
      const inputBad = editing?.id === id && invalidInput;
      return { id, label: <PartyName id={id} />, cells: [number(simpleValue(SIMPLE_ALL, [id])), number(simpleValue(SIMPLE_14_24, [id])), <div>
        <input aria-label={`מנדטים ל${nameOf(id)}`} aria-invalid={bad || inputBad || undefined} title={bad ? "0 או לפחות 4 מנדטים" : undefined} className="w-full min-h-[44px] text-center rounded-theme border border-paper-line bg-paper-card text-ink" inputMode="numeric" type="text" value={editing?.id === id ? editing.text : value} onChange={e => { const text = e.target.value; setEditing({ id, text }); if (/^\d+$/.test(text) && Number(text) <= 120) change(id, Number(text)); }} onBlur={() => { if (!invalidInput) setEditing(null); }} />
        <div className="flex"><button type="button" aria-label={`הפחתת מנדט ל${nameOf(id)}`} className="flex-1 min-h-[44px] text-lg disabled:opacity-30" disabled={value <= 0} onClick={() => { setEditing(null); change(id, value - 1); }}>−</button><button type="button" aria-label={`הוספת מנדט ל${nameOf(id)}`} className="flex-1 min-h-[44px] text-lg disabled:opacity-30" disabled={value >= 120} onClick={() => { setEditing(null); change(id, value + 1); }}>+</button></div>
        {inputBad && <span className="text-xs text-warn">0 עד 120</span>}{bad && <span className="text-xs text-warn">0 או לפחות 4</span>}
      </div>] };
    })} /></PollExplanation>
    <SaveError unit={unit} />{unit.queued && <Notice>ההשערה שמורה במכשיר וממתינה לאישור השרת.</Notice>}
    <ActionBar above={<div aria-label="הגושים בכנסת שלי" className="bg-paper-card border border-paper-line rounded-theme px-3 py-2 mb-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">{DEFAULT_BLOCS.blocs.map(b => <span key={b.id}>{b.name} <strong className="tabular text-sm">{b.lists.reduce((sum, id) => sum + (draft.seats[id]?.v ?? 0), 0)}</strong></span>)}</div>} note={(total === 120 || invalidInput) && invalid ? invalid : undefined}><span role="status" aria-live="polite" className="text-sm px-2 tabular">{total < 120 ? `מילאת ${total} מתוך 120 · נשארו ${120 - total}` : total > 120 ? `יש ${total} מנדטים · צריך להפחית ${total - 120}` : "120 מתוך 120"}</span><SaveButton unit={unit} session={session} invalid={invalid} compact />{unit.status === "saved" && !unit.queued && <Link to="/community" className="text-sm px-2">לכנסת הממוצעת</Link>}</ActionBar>
    <SimpleFooter /></div>;
}
