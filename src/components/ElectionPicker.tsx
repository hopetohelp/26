import { useEffect, useRef, useState } from "react";
import { K26_ID, PICKER_OPTIONS, SUMMARY_ID, electionOption, useElection } from "../lib/election";

/**
 * כפתור המערכת בפס העליון (הכרעות בעלים 02.11.2026): השנה כתובה תמיד על הכפתור, והוא מתמלא כשהמערכת אינה 2026.
 * בלחיצה — רשימת המערכות ו"סיכום". נסגר בבחירה, בלחיצה בחוץ וב-Escape.
 */
export default function ElectionPicker({ centered = false }: { centered?: boolean }) {
  const [id, setId] = useElection();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = electionOption(id);
  return <div ref={box} className={`f-election${centered ? " centered" : ""}`}>
    <button type="button" aria-haspopup="true" aria-expanded={open} aria-label={`מערכת בחירות: ${cur.label}. בחירת מערכת אחרת`}
      className={`f-btn f-election-btn${id !== K26_ID ? " past" : ""}`} onClick={() => setOpen((v) => !v)}>
      <span>{cur.label}</span>{cur.knesset && <span className="f-election-k">הכנסת ה־{cur.knesset}</span>}<span aria-hidden="true">▾</span>
    </button>
    {open && <ul role="menu" aria-label="מערכת בחירות">
      {PICKER_OPTIONS.map((o) => <li key={o.id} role="none">
        {o.id === SUMMARY_ID && <hr aria-hidden="true" />}
        <button type="button" role="menuitemradio" aria-checked={o.id === id} onClick={() => { setId(o.id); setOpen(false); }}>
          <span>{o.label}</span><span className="f-election-sub">{o.knesset ? `הכנסת ה־${o.knesset}` : o.full}</span>
        </button>
      </li>)}
    </ul>}
  </div>;
}
