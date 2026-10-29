import { useEffect, useId, useRef, useState } from "react";

export interface Suggestion { id: string; value: string; label: string }

/** רשימה מלאה וגלילה, עם בחירה בעכבר, במגע ובמקלדת. */
export default function SearchField({ label, value, onChange, options, onSelect, disabled = false, numeric = false }: {
  label: string; value: string; onChange: (v: string) => void; options: Suggestion[];
  onSelect?: (o: Suggestion) => void; disabled?: boolean; numeric?: boolean;
}) {
  const id = useId(), list = `${id}-options`;
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const expanded = open && !disabled;
  const choose = (o: Suggestion) => { onChange(o.value); onSelect?.(o); setOpen(false); setActive(-1); };
  useEffect(() => { root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);
  return <div ref={root} className="relative min-w-0" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="block text-sm mb-1">{label}</label>
    <input id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={expanded}
      aria-controls={expanded ? list : undefined} aria-activedescendant={expanded && active >= 0 ? `${list}-${active}` : undefined}
      disabled={disabled} inputMode={numeric ? "numeric" : "text"} value={value}
      onFocus={(e) => { setOpen(true); setActive(-1); if (value === "הכל") e.currentTarget.select(); }} onClick={() => setOpen(true)}
      onChange={(e) => { onChange(e.target.value); setActive(-1); setOpen(true); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setOpen(false); setActive(-1); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault(); setOpen(true);
          setActive((a) => !options.length ? -1 : a < 0 ? e.key === "ArrowDown" ? 0 : options.length - 1 : (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        } else if (e.key === "Enter" && expanded && options[active]) { e.preventDefault(); choose(options[active]); }
      }}
      className="w-full min-w-0 border border-paper-line rounded-theme bg-paper px-3 py-2 min-h-[44px] disabled:opacity-40" />
    {expanded && <ul id={list} role="listbox" aria-label={label} className="absolute z-20 top-full mt-1 w-full max-h-64 overflow-y-auto overscroll-contain rounded-theme border border-paper-line bg-paper-card shadow-lg">
      {options.map((o, i) => <li id={`${list}-${i}`} key={o.id} role="option" aria-selected={active === i}
        onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}
        className={`px-3 py-2 min-h-[44px] cursor-pointer text-sm break-words ${active === i ? "bg-accent-soft" : "hover:bg-accent-soft"}`}>{o.label}</li>)}
      {!options.length && <li role="presentation" className="p-3 text-sm text-ink-soft">אין התאמות</li>}
    </ul>}
  </div>;
}

