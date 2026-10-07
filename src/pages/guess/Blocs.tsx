import { useState } from "react";
import { customBlocs, moveList, removeBloc } from "./blocEditing";
import type { Bloc, BlocsPayload } from "../../lib/crowdApi";
import { MAX_BLOCS, validateBlocs } from "../../lib/crowdValidate";
import { TOTAL } from "../../lib/fillAll";
import { DEFAULT_BLOCS, IDS, nameOf } from "./model";
import SaveButton from "./SaveButton";
import { Btn, inputCls, Notice, StatusPill } from "./ui";
import type { useSession, useUnit } from "./useCrowd";

/**
 * הגושים. בלשונית "מנדטים וגושים" הם מוצגים יחד עם המנדטים (embedded): בלי כפתור שמירה משלהם, עם השוואה חיה
 * בין היעד של כל גוש לבין סכום המנדטים שחילקתם, ושתי דרכים ליישר: להתאים את המנדטים ליעד, או את היעד למנדטים.
 */
export default function Blocs({
  unit,
  session,
  mySeats,
  embedded = false,
  onFit,
}: {
  unit: ReturnType<typeof useUnit<BlocsPayload>>;
  session: ReturnType<typeof useSession>;
  mySeats: Record<string, number> | null;
  embedded?: boolean;
  onFit?: () => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const p = unit.draft ?? DEFAULT_BLOCS;
  const setBlocs = (blocs: Bloc[], mode = p.mode) => unit.setDraft({ mode, blocs });
  const patch = (i: number, b: Partial<Bloc>) => setBlocs(p.blocs.map((x, j) => (j === i ? { ...x, ...b } : x)));
  const invalid = validateBlocs(p, IDS);
  const unassigned = IDS.filter(id => !p.blocs.some(b => b.lists.includes(id)));
  const assign = (id: string, to: string) => {
    if (!IDS.includes(id)) return;
    setBlocs(moveList(p.blocs, id, to));
    setAnnouncement(`${nameOf(id)} הועברה ל${p.blocs.find(b => b.id === to)?.name}`);
  };
  const partyCard = (id: string) => <li key={id} draggable onDragStart={e => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; }} className="border border-paper-line bg-paper rounded-theme p-2 space-y-1">
    <div className="flex justify-between gap-2 text-sm"><b>{nameOf(id)}</b><span className="tabular">{mySeats?.[id] ?? "—"} מנדטים</span></div>
    <label className="text-xs flex items-center gap-2">העבר לגוש
      <select aria-label={`הגוש של ${nameOf(id)}`} value={p.blocs.find(b => b.lists.includes(id))?.id ?? ""} onChange={e => assign(id,e.target.value)} className="min-h-[44px] min-w-0 flex-1 border border-paper-line rounded-theme bg-paper-card text-ink px-2">
        <option value="" disabled>בחירת גוש</option>{p.blocs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  </li>;
  const newId = () => `b${Date.now().toString(36)}`;
  const clamp = (n: number) => Math.max(0, Math.min(TOTAL, Math.round(n) || 0));
  const two = p.blocs.length === 2;
  /** בשני גושים מספיק למלא אחד: השני מקבל אוטומטית את כל מה שנשאר (120 פחות הערך) */
  const setTarget = (i: number, n: number) => {
    const t = clamp(n);
    setBlocs(two ? p.blocs.map((x, j) => ({ ...x, target: j === i ? t : TOTAL - t })) : p.blocs.map((x, j) => (j === i ? { ...x, target: t } : x)));
  };
  const setNoGuess = (i: number, none: boolean, fromSeats: number | null) => {
    if (none) return setBlocs(two ? p.blocs.map((x) => ({ ...x, target: null })) : p.blocs.map((x, j) => (j === i ? { ...x, target: null } : x)));
    setTarget(i, fromSeats ?? 60);
  };
  const seatsOf = (b: Bloc) => (mySeats ? b.lists.reduce((a, id) => a + (mySeats[id] ?? 0), 0) : null);
  const mismatch = p.blocs.some((b) => b.target !== null && seatsOf(b) !== null && seatsOf(b) !== b.target);
  /** "עדכנו את היעד לפי המנדטים": בשני גושים הראשון לפי המנדטים והשני משלים; אחרת כל יעד לפי המנדטים של הגוש שלו */
  const targetsFromSeats = () => {
    if (!mySeats) return;
    const first = p.blocs.findIndex((b) => b.target !== null);
    if (first < 0) return;
    if (two) return setTarget(first, seatsOf(p.blocs[first]) ?? 0);
    setBlocs(p.blocs.map((b) => (b.target === null ? b : { ...b, target: clamp(seatsOf(b) ?? 0) })));
  };

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="סוג הגושים" className="flex gap-2 flex-wrap">
        {(
          [
            ["gov37", "הממשלה היוצאת מול השאר"],
            ["custom", "גושים משלי"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={p.mode === m}
            onClick={() =>
              m === "gov37"
                ? unit.setDraft(DEFAULT_BLOCS)
                : setBlocs(p.mode === "custom" ? p.blocs : customBlocs(IDS), "custom")
            }
            className={`min-h-[44px] px-4 rounded-full border-2 text-sm font-bold ${p.mode === m ? "bg-ink text-paper-card border-ink" : "bg-paper-card border-paper-line"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {p.mode === "gov37" && (
        <p className="text-sm text-ink-soft">"מפלגות הממשלה היוצאת" = הרשימות של מפלגות ממשלה 37, הגדרה עובדתית: {p.blocs[0].lists.map(nameOf).join(", ")}.</p>
      )}

      <p role="status" className="sr-only">{announcement}</p>
      {p.mode === "custom" && <p className="text-sm text-ink-soft">כל מפלגה בגוש אחד. גררו כרטיס לגוש או בחרו יעד בכרטיס. העברה אינה משנה מנדטים או יעדים.</p>}
      {two && <p className="text-sm text-ink">מספיק למלא גוש אחד — הגוש השני מקבל אוטומטית את כל מה שנשאר (120 פחות המספר).</p>}
      <div className="grid sm:grid-cols-2 gap-3 [&>*]:min-w-0">
        {p.blocs.map((b, i) => {
          const fromSeats = seatsOf(b);
          const diff = b.target !== null && fromSeats !== null ? fromSeats - b.target : null;
          return (
            <div key={b.id} onDragOver={e => { if (p.mode === "custom") e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (p.mode === "custom") assign(e.dataTransfer.getData("text/plain"), b.id); }} className="bg-paper-card border border-paper-line rounded-theme p-4 space-y-2">
              {p.mode === "custom" ? (
                <input aria-label={`שם הגוש ${i + 1}`} className={`${inputCls} font-display text-2xl`} value={b.name} maxLength={40} onChange={(e) => patch(i, { name: e.target.value })} />
              ) : (
                <h3 className="font-display text-3xl leading-none">{b.name}</h3>
              )}
              <div className="flex items-end gap-2 flex-wrap">
                <label className="text-sm">
                  <span className="font-bold block mb-1">כמה מנדטים יקבל הגוש?</span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    inputMode="numeric"
                    value={b.target ?? ""}
                    placeholder="—"
                    onChange={(e) => setTarget(i, Number(e.target.value))}
                    className="w-24 min-h-[44px] rounded-theme border border-paper-line bg-paper text-ink px-2 font-num tabular text-2xl"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm min-h-[44px]">
                  <input type="checkbox" className="w-5 h-5" checked={b.target === null} onChange={(e) => setNoGuess(i, e.target.checked, fromSeats)} />
                  בלי ניחוש
                </label>
              </div>
              {fromSeats !== null && (
                <p className="text-sm text-ink">
                  לפי המנדטים שחילקתם: <strong className="tabular">{fromSeats}</strong>
                  {diff !== null && (
                    <span className={`block text-xs mt-0.5 ${diff === 0 ? "text-ink-soft" : "text-warn font-bold"}`}>
                      {diff === 0 ? "מתאים ליעד" : diff > 0 ? `במנדטים יש ${diff} יותר מהיעד` : `במנדטים חסרים ${-diff} כדי להגיע ליעד`}
                    </span>
                  )}
                </p>
              )}
              {p.mode === "custom" && (
                <>
                  <ul className="space-y-2" aria-label={`המפלגות ב${b.name}`}>{b.lists.map(partyCard)}</ul>{!b.lists.length && <p className="text-xs text-ink-soft">הגוש ריק — אפשר להעביר אליו כרטיסים.</p>}
                  {p.blocs.length > 1 && (
                    <button type="button" className="text-sm underline text-ink-soft min-h-[44px]" onClick={() => { setRemoving(b.id); setDestination(p.blocs.find(x => x.id !== b.id && x.id === "b")?.id ?? p.blocs.find(x => x.id !== b.id)!.id); }}>
                      הסרת הגוש
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {p.mode === "custom" && (
        <>
          {p.blocs.length < MAX_BLOCS && <Btn onClick={() => setBlocs([...p.blocs, { id: newId(), name: `גוש ${"אבגד"[p.blocs.length]}`, lists: [], target: null }])}>עוד גוש</Btn>}
          {unassigned.length > 0 && <section className="border border-warn rounded-theme p-3 space-y-2">
            <p className="text-sm">בטיוטה הישנה יש מפלגות ללא גוש. אפשר לבחור יעד בכל כרטיס או להעביר את כולן לגוש ב׳.</p>
            <ul className="space-y-2">{unassigned.map(partyCard)}</ul>
            <Btn onClick={() => { const target = p.blocs.find(b => b.id === "b") ?? p.blocs[1] ?? p.blocs[0]; setBlocs(unassigned.reduce((bs,id) => moveList(bs,id,target.id),p.blocs)); }}>העברת המפלגות הלא משויכות ל{(p.blocs.find(b => b.id === "b") ?? p.blocs[1] ?? p.blocs[0]).name}</Btn>
          </section>}
          {removing && <section role="region" aria-label="אישור הסרת גוש" className="border-2 border-warn rounded-theme p-3 space-y-2">
            <p>הסרת {p.blocs.find(b => b.id === removing)?.name}: המפלגות הבאות יעברו לגוש שתבחרו: {p.blocs.find(b => b.id === removing)?.lists.map(nameOf).join(", ") || "הגוש ריק"}. יעד הגוש הנמחק יוסר; יתר היעדים והמנדטים יישארו.</p>
            <label className="block">גוש יעד <select className={inputCls} value={destination} onChange={e => setDestination(e.target.value)}>{p.blocs.filter(b => b.id !== removing).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <div className="flex gap-2"><Btn onClick={() => { setBlocs(removeBloc(p.blocs, removing, destination)); setRemoving(null); }}>אישור ההעברה וההסרה</Btn><Btn onClick={() => setRemoving(null)}>ביטול</Btn></div>
          </section>}
        </>
      )}

      {invalid && p.blocs.some((b) => b.target !== null) && <Notice tone="warn">{invalid}</Notice>}
      <p className="text-xs text-ink-soft">"בלי ניחוש" שונה מ-0: 0 אומר שהגוש לא יקבל אף מנדט. היעדים משמשים גם את "השלם הכול" במסך המנדטים.</p>
      {embedded && mismatch && (
        <div className="rounded-theme border-2 border-warn bg-warn-soft p-3 space-y-2" role="status">
          <p className="text-sm font-bold text-warn">המנדטים והגושים עוד לא מתאימים זה לזה.</p>
          <div className="flex gap-2 flex-wrap">
            {onFit && <Btn onClick={onFit}>התאימו את המנדטים ליעד</Btn>}
            <Btn onClick={targetsFromSeats}>עדכנו את היעד לפי המנדטים</Btn>
          </div>
          <p className="text-xs text-ink">"התאימו את המנדטים" משנה רק רשימות פתוחות; רשימות נעולות נשארות כמו שקבעתם.</p>
        </div>
      )}
      {!embedded && (
        <div className="flex items-center gap-3 flex-wrap">
          <SaveButton unit={unit} session={session} invalid={invalid ?? (p.blocs.every((b) => b.target === null) ? "אין יעד לאף גוש." : null)} />
          <StatusPill status={unit.status} />
        </div>
      )}
    </div>
  );
}
