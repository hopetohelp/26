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
  const p = unit.draft ?? DEFAULT_BLOCS;
  const setBlocs = (blocs: Bloc[], mode = p.mode) => unit.setDraft({ mode, blocs });
  const patch = (i: number, b: Partial<Bloc>) => setBlocs(p.blocs.map((x, j) => (j === i ? { ...x, ...b } : x)));
  const invalid = validateBlocs(p, IDS);
  const blocOf = (id: string) => p.blocs.findIndex((b) => b.lists.includes(id));
  const assign = (id: string, to: number) =>
    setBlocs(p.blocs.map((b, j) => ({ ...b, lists: j === to ? [...b.lists.filter((x) => x !== id), id] : b.lists.filter((x) => x !== id) })));
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
                : setBlocs(p.mode === "custom" ? p.blocs : [{ id: newId(), name: "גוש א", lists: [], target: null }, { id: newId() + "x", name: "גוש ב", lists: [], target: null }], "custom")
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

      {two && <p className="text-sm text-ink">מספיק למלא גוש אחד — הגוש השני מקבל אוטומטית את כל מה שנשאר (120 פחות המספר).</p>}
      <div className="grid sm:grid-cols-2 gap-3 [&>*]:min-w-0">
        {p.blocs.map((b, i) => {
          const fromSeats = seatsOf(b);
          const diff = b.target !== null && fromSeats !== null ? fromSeats - b.target : null;
          return (
            <div key={b.id} className="bg-paper-card border border-paper-line rounded-theme p-4 space-y-2">
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
                  <p className="text-xs text-ink-soft">{b.lists.length ? b.lists.map(nameOf).join(", ") : "עוד אין רשימות בגוש."}</p>
                  {p.blocs.length > 1 && (
                    <button type="button" className="text-sm underline text-ink-soft min-h-[44px]" onClick={() => setBlocs(p.blocs.filter((_, j) => j !== i))}>
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
          <fieldset>
            <legend className="font-bold text-sm mb-2">איזו רשימה בכל גוש? (רשימה בגוש אחד לכל היותר)</legend>
            <ul className="divide-y divide-paper-line border-y border-paper-line">
              {IDS.map((id) => (
                <li key={id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-sm">{nameOf(id)}</span>
                  <select aria-label={`הגוש של ${nameOf(id)}`} className="min-h-[44px] rounded-theme border border-paper-line bg-paper-card text-ink px-2 text-sm max-w-[50%]" value={blocOf(id)} onChange={(e) => assign(id, Number(e.target.value))}>
                    <option value={-1}>בלי גוש</option>
                    {p.blocs.map((b, j) => (
                      <option key={b.id} value={j}>
                        {b.name || `גוש ${j + 1}`}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </fieldset>
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
