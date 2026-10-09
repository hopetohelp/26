import { useState } from "react";
import type { Bloc, BlocsPayload } from "../../lib/crowdApi";
import { MAX_BLOCS, validateBlocs } from "../../lib/crowdValidate";
import { DEFAULT_BLOCS, IDS, nameOf, normalizeBlocs } from "./model";
import { moveList, removeBloc, removeList } from "./blocEditing";
import SaveButton from "./SaveButton";
import { Btn, inputCls, Notice } from "./ui";
import type { useSession, useUnit } from "./useCrowd";
import BlocParty from "./BlocParty";
import { useIsPhone } from "./useIsPhone";

export default function Blocs({ unit, session, mySeats }: {
  unit: ReturnType<typeof useUnit<BlocsPayload>>; session: ReturnType<typeof useSession>;
  mySeats: Record<string, number> | null;
}) {
  const [pending, setPending] = useState<{ id: string; blocs: Bloc[] } | null>(null);
  const [requiredName, setRequiredName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const phone = useIsPhone();
  const p = unit.draft ? normalizeBlocs(unit.draft) : DEFAULT_BLOCS;
  const setBlocs = (blocs: Bloc[]) => unit.setDraft({ mode: "custom", schemaVersion: 2, blocs });
  const patch = (id: string, part: Partial<Bloc>) => setBlocs(p.blocs.map(b => b.id === id ? { ...b, ...part } : b));
  const changeComposition = (id: string, blocs: Bloc[]) => {
    const before = p.blocs.find(b => b.id === id);
    const after = blocs.find(b => b.id === id);
    if (!before || !after || [...before.lists].sort().join(",") === [...after.lists].sort().join(",")) return;
    setRequiredName(""); setPending({id, blocs});
  };
  const assign = (id: string, to: string) => {
    if (!IDS.includes(id)) return;
    changeComposition(to, moveList(p.blocs, id, to));
    setAnnouncement(`${nameOf(id)} נוספה ל${p.blocs.find(b => b.id === to)?.name}`);
  };
  const invalid = validateBlocs(p, IDS);
  const remove = (id: string, from: string) => {
    changeComposition(from, removeList(p.blocs, id, from));
    setAnnouncement(`${nameOf(id)} הוסרה מ${p.blocs.find(b => b.id === from)?.name}`);
  };
  const oldName = pending ? p.blocs.find(b => b.id === pending.id)?.name : null;
  const nameReady = requiredName.trim().length > 0 && requiredName.trim() !== oldName && !DEFAULT_BLOCS.blocs.some(b => b.name === requiredName.trim());
  return <div className="space-y-4">
    {pending && <div className="fixed inset-0 z-[100] bg-ink/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="rename-bloc-title" onKeyDown={e => { if (e.key === "Escape") setPending(null); }}>
      <form className="bg-paper-card text-ink border border-paper-line rounded-theme p-4 w-full max-w-md space-y-3" onSubmit={e => { e.preventDefault(); if (!nameReady) return; setBlocs(pending.blocs.map(b => b.id === pending.id ? {...b,name:requiredName.trim()} : b)); setPending(null); }}>
        <h3 id="rename-bloc-title" className="font-display text-2xl">שם להרכב החדש</h3>
        <p className="text-sm">שינוי ההרכב של ״{oldName}״ מחייב שם חדש. השינוי יישמר יחד עם השם.</p>
        <label className="block text-sm">שם הגוש החדש<input autoFocus required maxLength={40} className={`${inputCls} w-full mt-1`} value={requiredName} onChange={e => setRequiredName(e.target.value)} /></label>
        <p className="text-xs text-ink-soft">בחרו שם שונה מהשם הקודם ומשמות חמשת הגושים הקבועים.</p>
        <div className="flex gap-2"><button type="submit" disabled={!nameReady} className="min-h-[44px] px-4 rounded-theme bg-ink text-paper-card disabled:opacity-50">שמירת השם וההרכב</button><Btn onClick={() => setPending(null)}>ביטול</Btn></div>
      </form>
    </div>}

    <p className="text-sm text-ink-soft">עד חמישה גושים עצמאיים. מפלגה יכולה להשתתף בכמה גושים; אין צורך לשייך את כל המפלגות. סכומי הגושים אינם מתחברים ל־120.</p>
    {phone ? <p className="text-sm text-ink-soft">לחצו על "+ הוספת מפלגה" בגוש כדי לבחור מפלגות. כפתור "הסר" מסיר מפלגה רק מהגוש הזה.</p> : <p className="text-sm text-ink-soft">לחצו על "+ הוספת מפלגה" בגוש כדי לבחור מפלגות. גרירה בין גושים מוסיפה עותק; גרירה החוצה או כפתור "הסר" מסירים רק מהגוש הזה. במקלדת: חצים להוספה לגוש אחר, Delete להסרה.</p>}
    <p role="status" className="sr-only">{announcement}</p>
    <div className="grid sm:grid-cols-2 gap-3 items-start [&>*]:min-w-0">
      {p.blocs.map((b, i) => {
        const total = mySeats ? b.lists.reduce((n, id) => n + (mySeats[id] ?? 0), 0) : null;
        return <section key={b.id} data-bloc-id={b.id} className={`bg-paper-card border-2 rounded-theme p-4 space-y-3 ${hovered === b.id ? "border-ink" : "border-paper-line"}`}>
          <div className="flex gap-2 items-start">
            <div className="flex-1 min-w-0">{editing === b.id ? <input autoFocus aria-label={`שם הגוש ${i + 1}`} className={`${inputCls} w-full font-display text-2xl`} maxLength={40} value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={() => { if (nameDraft.trim()) patch(b.id, { name: nameDraft.trim() }); setEditing(null); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }} /> : <h3 className="font-display text-2xl"><button type="button" className="w-full text-start min-h-[44px] break-words rounded-theme focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal" aria-label={`עריכת שם הגוש: ${b.name}`} onClick={() => { setNameDraft(b.name); setEditing(b.id); }}>{b.name}</button></h3>}</div>
          </div>

          {picker === b.id && <div id={`bloc-picker-${b.id}`} className="rounded-theme border border-paper-line p-3" onKeyDown={e => { if (e.key === "Escape") { setPicker(null); e.currentTarget.parentElement?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus(); } }}>
            <fieldset className="max-h-64 overflow-y-auto space-y-1"><legend className="font-bold text-sm mb-2">מפלגות ב{b.name}</legend>{IDS.map(id => <label key={id} className="flex gap-2 items-center min-h-[44px] text-sm"><input type="checkbox" checked={b.lists.includes(id)} onChange={e => e.target.checked ? assign(id, b.id) : remove(id, b.id)} />{nameOf(id)}</label>)}</fieldset>
            <Btn onClick={() => setPicker(null)}>סיום בחירה</Btn>
          </div>}

          {total !== null && <p className="font-display text-3xl tabular">{total} מנדטים לפי ההשערה</p>}
          <label className="block text-sm">יעד עצמאי (רשות)<input type="number" min={0} max={120} inputMode="numeric" value={b.target ?? ""} className={`${inputCls} w-24 ms-2`} onChange={e => patch(b.id, { target: e.target.value === "" ? null : Math.max(0, Math.min(120, Math.round(Number(e.target.value) || 0))) })} /></label>
          {total !== null && b.target !== null && total !== b.target && <p className="text-sm text-warn">היעד {b.target}; סכום המפלגות {total}.</p>}
          <ul className="space-y-2">{b.lists.map(id => <BlocParty key={id} id={id} name={nameOf(id)} seats={mySeats?.[id] ?? null} current={b.id} targets={p.blocs.map(x => x.id)} onMove={assign} onRemove={remove} onHover={setHovered} />)}</ul>
          {<button type="button" aria-label={`הוספת מפלגות לגוש ${b.name}`} aria-expanded={picker === b.id} aria-controls={`bloc-picker-${b.id}`} onClick={() => setPicker(picker === b.id ? null : b.id)} className="w-full min-h-[48px] flex items-center gap-2 text-sm text-start border border-dashed border-paper-line bg-paper rounded-theme p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"><b className="text-xl leading-none" aria-hidden="true">+</b><span>הוספת מפלגה</span></button>}
          {!b.lists.length && <p className="text-sm text-ink-soft">גוש ריק — לחצו על + להוספת מפלגות.</p>}
          {p.blocs.length > 1 && <Btn onClick={() => setBlocs(removeBloc(p.blocs, b.id))}>מחיקת הגוש</Btn>}
        </section>;
      })}
      {p.blocs.length < MAX_BLOCS && <button type="button" onClick={() => setBlocs([...p.blocs, { id: `b-${crypto.randomUUID().slice(0, 20)}`, name: `גוש ${p.blocs.length + 1}`, lists: [], target: null }])}
        className="min-h-[10rem] flex flex-col items-center justify-center gap-2 bg-paper-card border-2 border-dashed border-paper-line hover:border-ink rounded-theme p-4 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
        <span aria-hidden="true" className="text-4xl leading-none font-bold">+</span>
        <span className="font-display text-2xl">הוספת גוש</span>
        <span className="text-sm text-ink-soft">{p.blocs.length}/{MAX_BLOCS} גושים</span>
      </button>}
    </div>
    {invalid && <Notice tone="warn">{invalid}</Notice>}
    <SaveButton unit={unit} session={session} invalid={invalid} />
  </div>;
}
