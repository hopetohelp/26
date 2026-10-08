import { useState } from "react";
import type { Bloc, BlocsPayload } from "../../lib/crowdApi";
import { MAX_BLOCS, validateBlocs } from "../../lib/crowdValidate";
import { DEFAULT_BLOCS, IDS, nameOf, normalizeBlocs } from "./model";
import { moveList, removeBloc } from "./blocEditing";
import SaveButton from "./SaveButton";
import { Btn, inputCls, Notice } from "./ui";
import type { useSession, useUnit } from "./useCrowd";
import BlocParty from "./BlocParty";

export default function Blocs({ unit, session, mySeats, embedded = false, onFit }: {
  unit: ReturnType<typeof useUnit<BlocsPayload>>; session: ReturnType<typeof useSession>;
  mySeats: Record<string, number> | null; embedded?: boolean; onFit?: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const p = unit.draft ? normalizeBlocs(unit.draft) : DEFAULT_BLOCS;
  const setBlocs = (blocs: Bloc[]) => unit.setDraft({ mode: "custom", blocs });
  const patch = (id: string, part: Partial<Bloc>) => setBlocs(p.blocs.map(b => b.id === id ? { ...b, ...part } : b));
  const assign = (id: string, to: string) => {
    if (!IDS.includes(id)) return;
    setBlocs(moveList(p.blocs, id, to));
    setAnnouncement(`${nameOf(id)} נוספה ל${p.blocs.find(b => b.id === to)?.name}`);
  };
  const invalid = validateBlocs(p, IDS);
  return <div className="space-y-4">
    <p className="text-sm text-ink-soft">עד חמישה גושים עצמאיים. מפלגה יכולה להשתתף בכמה גושים; אין צורך לשייך את כל המפלגות. סכומי הגושים אינם מתחברים ל־120.</p>
    <p className="text-sm text-ink-soft">סמנו מפלגות בכל גוש, או גררו כרטיס לגוש כדי להוסיף עותק. במקלדת אפשר להשתמש בתיבות הסימון.</p>
    <p role="status" className="sr-only">{announcement}</p>
    <div className="grid sm:grid-cols-2 gap-3 [&>*]:min-w-0">
      {p.blocs.map((b, i) => {
        const total = mySeats ? b.lists.reduce((n, id) => n + (mySeats[id] ?? 0), 0) : null;
        return <section key={b.id} data-bloc-id={b.id} className={`bg-paper-card border-2 rounded-theme p-4 space-y-3 ${hovered === b.id ? "border-ink" : "border-paper-line"}`}>
          {editing === b.id ? <input autoFocus aria-label={`שם הגוש ${i + 1}`} className={`${inputCls} w-full font-display text-2xl`} maxLength={40} value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={() => { if (nameDraft.trim()) patch(b.id, { name: nameDraft.trim() }); setEditing(null); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }} /> : <h3 className="font-display text-2xl"><button type="button" className="w-full text-start min-h-[44px] break-words rounded-theme focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal" aria-label={`עריכת שם הגוש: ${b.name}`} onClick={() => { setNameDraft(b.name); setEditing(b.id); }}>{b.name}</button></h3>}

          {total !== null && <p className="font-display text-3xl tabular">{total} מנדטים לפי ההשערה</p>}
          <label className="block text-sm">יעד עצמאי (רשות)<input type="number" min={0} max={120} inputMode="numeric" value={b.target ?? ""} className={`${inputCls} w-24 ms-2`} onChange={e => patch(b.id, { target: e.target.value === "" ? null : Math.max(0, Math.min(120, Math.round(Number(e.target.value) || 0))) })} /></label>
          {total !== null && b.target !== null && total !== b.target && <p className="text-sm text-warn">היעד {b.target}; סכום המפלגות {total}.</p>}
          <details><summary className="cursor-pointer min-h-[44px] flex items-center font-bold">בחירת מפלגות ({b.lists.length})</summary><fieldset className="space-y-1"><legend className="sr-only">מפלגות ב{b.name}</legend>{IDS.map(id => <label key={id} className="flex gap-2 items-center min-h-[44px] text-sm"><input type="checkbox" checked={b.lists.includes(id)} onChange={e => patch(b.id, { lists: e.target.checked ? [...b.lists, id] : b.lists.filter(x => x !== id) })} />{nameOf(id)}</label>)}</fieldset></details>
          <ul className="space-y-2">{b.lists.map(id => <BlocParty key={id} id={id} name={nameOf(id)} seats={mySeats?.[id] ?? null} current={b.id} targets={p.blocs.map(x => x.id)} onMove={assign} onHover={setHovered} />)}</ul>
          {!b.lists.length && <p className="text-sm text-ink-soft">גוש ריק — בחרו מפלגות.</p>}
          {p.blocs.length > 1 && <Btn onClick={() => setBlocs(removeBloc(p.blocs, b.id))}>מחיקת הגוש</Btn>}
        </section>;
      })}
    </div>
    <Btn disabled={p.blocs.length >= MAX_BLOCS} onClick={() => setBlocs([...p.blocs, { id: `b-${crypto.randomUUID().slice(0, 20)}`, name: `גוש ${p.blocs.length + 1}`, lists: [], target: null }])}>הוספת גוש ({p.blocs.length}/{MAX_BLOCS})</Btn>
    {invalid && <Notice tone="warn">{invalid}</Notice>}
    {embedded && onFit && p.blocs.some(b => b.target !== null) && <Btn onClick={onFit}>השלמה לפי היעדים</Btn>}
    {!embedded && <SaveButton unit={unit} session={session} invalid={invalid} />}
  </div>;
}
