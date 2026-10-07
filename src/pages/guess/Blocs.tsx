import { useEffect, useState } from "react";
import { moveList } from "./blocEditing";
import type { Bloc, BlocsPayload } from "../../lib/crowdApi";
import { validateBlocs } from "../../lib/crowdValidate";
import { TOTAL } from "../../lib/fillAll";
import { DEFAULT_BLOCS, IDS, nameOf } from "./model";
import SaveButton from "./SaveButton";
import { Btn, inputCls, Notice, StatusPill } from "./ui";
import type { useSession, useUnit } from "./useCrowd";
import BlocParty from "./BlocParty";

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
  const [announcement, setAnnouncement] = useState("");
  const [customized, setCustomized] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const p = unit.draft?.mode === "gov37" ? DEFAULT_BLOCS : unit.draft ?? DEFAULT_BLOCS;
  useEffect(() => {
    if (unit.draft?.mode === "gov37") unit.setDraft(DEFAULT_BLOCS);
  }, [unit.draft, unit.setDraft]);
  const setBlocs = (blocs: Bloc[], mode = p.mode) => unit.setDraft({ mode, blocs });
  const patch = (i: number, b: Partial<Bloc>) => setBlocs(p.blocs.map((x, j) => (j === i ? { ...x, ...b } : x)));
  const invalid = validateBlocs(p, IDS);
  const unassigned = IDS.filter(id => !p.blocs.some(b => b.lists.includes(id)));
  const assign = (id: string, to: string) => {
    if (!IDS.includes(id)) return;
    if (!p.blocs.some(b => b.id === to) || p.blocs.find(b => b.id === to)?.lists.includes(id)) return;
    setBlocs(moveList(p.blocs, id, to), "custom");
    setAnnouncement(`${nameOf(id)} הועברה ל${p.blocs.find(b => b.id === to)?.name}`);
  };
  const partyCard = (id: string) => <BlocParty key={id} id={id} name={nameOf(id)} seats={mySeats?.[id] ?? null}
    current={p.blocs.find(b => b.lists.includes(id))?.id} targets={p.blocs.map(b => b.id)} onMove={assign} onHover={setHovered} />;
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
      <p className="text-sm text-ink-soft">גררו כרטיס מפלגה לגוש אחר עם העכבר או האצבע. במקלדת: התמקדו בכרטיס והעבירו עם החצים ימינה ושמאלה.</p>
      <p role="status" className="sr-only">{announcement}</p>
      <div className="flex justify-center"><Btn onClick={() => setCustomized(!customized)}>{customized ? "סיום עריכת שמות" : "עריכת שמות הגושים"}</Btn></div>
      <p className="text-sm text-ink-soft">כל מפלגה נמצאת בגוש אחד. העברה אינה משנה את מספר המנדטים או את שמות הגושים.</p>
      <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
        {p.blocs.map((b, i) => {
          const fromSeats = seatsOf(b);
          const diff = b.target !== null && fromSeats !== null ? fromSeats - b.target : null;
          return (
            <div key={b.id} data-bloc-id={b.id} className={`bg-paper-card border-2 rounded-theme p-4 space-y-3 ${hovered === b.id ? "border-ink bg-accent-soft" : "border-paper-line"}`}>
              {customized ? (
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
              <ul className="space-y-2" aria-label={`המפלגות ב${b.name}`}>{b.lists.map(partyCard)}</ul>{!b.lists.length && <p className="text-xs text-ink-soft">הגוש ריק — אפשר להעביר אליו כרטיסים.</p>}
            </div>
          );
        })}
      </div>

      {unassigned.length > 0 && <section className="border border-warn rounded-theme p-3 space-y-2">
        <p className="text-sm">יש מפלגות ללא גוש. גררו אותן לגוש או העבירו עם החצים במקלדת.</p>
        <ul className="space-y-2">{unassigned.map(partyCard)}</ul>
      </section>}

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
