import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ROW_H = 44;
/** מרכז + שורה שלמה למעלה ולמטה + חצי שורה בקצוות: המספר הראשון והאחרון נראים רק בחציים */
const VISIBLE = 4;
const SHEET_H = ROW_H * VISIBLE;
const PAD = (SHEET_H - ROW_H) / 2;
const MAX = 60;
const COMMIT_AFTER_MS = 180;

/** 0 ו-4 עד 60 (אין 1 עד 3 בגלל אחוז החסימה); ערך קיים מעל 60 מוסיף את הטווח עד אליו, כדי שיוצג במרכז */
export function seatChoices(current: number): number[] {
  const top = Math.max(MAX, current);
  return [0, ...Array.from({ length: top - 3 }, (_, i) => i + 4)];
}

/**
 * בורר מנדטים (הכרעת בעלים 11.10.2026, אפשרות א): לחיצה על השדה פותחת גלגל גלילה מעל השדה, והמספר הנוכחי במרכזו.
 * הערך נשמר כשהגלילה נעצרת וביציאה; Esc, לחיצה מחוץ לגלגל או Enter סוגרים. נגיש במקלדת (חצים, PageUp/PageDown).
 */
export default function SeatPicker({ value, name, onCommit }: { value: number; name: string; onCommit: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState(value);
  const btn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const raf = useRef<number>(0);
  const choices = useMemo(() => seatChoices(value), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftRef = useRef(value);
  /** יעד מקשים שעדיין בגלילה: לחיצות מהירות נבנות זו על זו ולא על המספר שבדרך */
  const keyTarget = useRef<number | null>(null);
  const keyTimer = useRef<number>(0);
  const commit = useCallback((v: number) => { if (v !== value) onCommit(v); }, [value, onCommit]);

  const close = useCallback((focusBack = true) => {
    window.clearTimeout(timer.current);
    commit(keyTarget.current !== null ? choices[keyTarget.current] : draftRef.current);
    setOpen(false);
    if (focusBack) btn.current?.focus();
  }, [commit, choices]);

  const openIt = () => {
    if (!btn.current) return;
    setRect(btn.current.getBoundingClientRect());
    draftRef.current = value;
    setDraft(value);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !wheel.current) return;
    wheel.current.scrollTop = Math.max(0, choices.indexOf(value)) * ROW_H;
    wheel.current.focus({ preventScroll: true });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!sheet.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false); };
    const leave = () => close(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("scroll", leave);
    window.addEventListener("resize", leave);
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("scroll", leave); window.removeEventListener("resize", leave); };
  }, [open, close]);

  const go = (i: number, smooth: boolean) => {
    const idx = Math.max(0, Math.min(choices.length - 1, i));
    wheel.current?.scrollTo({ top: idx * ROW_H, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
  };
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = wheel.current;
      if (!el) return;
      const idx = Math.max(0, Math.min(choices.length - 1, Math.round(el.scrollTop / ROW_H)));
      const v = choices[idx];
      if (v !== draftRef.current) {
        draftRef.current = v;
        setDraft(v);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => commit(v), COMMIT_AFTER_MS);
      }
    });
  };
  const step = (delta: number) => {
    const base = keyTarget.current ?? choices.indexOf(draftRef.current);
    const idx = Math.max(0, Math.min(choices.length - 1, base + delta));
    keyTarget.current = idx;
    window.clearTimeout(keyTimer.current);
    keyTimer.current = window.setTimeout(() => { keyTarget.current = null; }, 400);
    go(idx, true);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    else if (e.key === "PageDown") { e.preventDefault(); step(5); }
    else if (e.key === "PageUp") { e.preventDefault(); step(-5); }
    else if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); keyTarget.current = null; close(); }
  };

  const width = 92;
  const style = rect ? {
    width,
    height: SHEET_H,
    left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)),
    top: Math.max(8, Math.min(window.innerHeight - SHEET_H - 8, rect.top + rect.height / 2 - SHEET_H / 2)),
  } : undefined;

  return (
    <>
      <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`מנדטים ל${name}: ${value}`} onClick={() => (open ? close() : openIt())}
        className="w-16 h-11 text-center font-num tabular text-2xl bg-paper text-ink rounded-theme border border-paper-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
        {value}
      </button>
      {open && createPortal(
        <div ref={sheet} style={{ ...style, position: "fixed" }} className="z-50 bg-paper-card text-ink border-2 border-ink rounded-theme shadow-lg overflow-hidden">
          <div ref={wheel} tabIndex={0} role="listbox" aria-label={`מנדטים ל${name}`} aria-activedescendant={`seat-opt-${draft}`} onScroll={onScroll} onKeyDown={onKey} className="seat-wheel h-full overflow-y-auto focus:outline-none" style={{ paddingBlock: PAD }}>
            {choices.map((n, i) => (
              <button key={n} id={`seat-opt-${n}`} type="button" role="option" tabIndex={-1} aria-selected={n === draft} onClick={() => (n === draft ? close() : go(i, true))}
                className={`seat-opt flex items-center justify-center w-full font-num tabular ${n === draft ? "text-ink font-bold text-2xl" : "text-ink-soft text-xl"}`} style={{ height: ROW_H }}>
                {n}
              </button>
            ))}
          </div>
          <div aria-hidden="true" className="absolute inset-x-0 border-y-2 border-ink pointer-events-none" style={{ top: PAD, height: ROW_H }} />
        </div>, document.body)}
    </>
  );
}
