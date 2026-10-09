import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

/**
 * בחירה אחת מכמה (הכרעת בעלים 9.10.2026): שני רכיבים, שניהם `radiogroup` עם חצים במקלדת, גובה 44px ומסגרת אחת.
 * - `Segmented`: 2 עד 4 אפשרויות, מקטעים שווים בשורה אחת. הנבחר: מסגרת כהה ורקע כרטיס.
 * - `Chips`: 5 אפשרויות ומעלה, כפתורים עגולים בשורה אחת עם גלילה וטשטוש בקצה. הנבחר: רקע כהה.
 * לשוניות מסכים (`Tabbed`), מתג הדלקה ובוחרי "תצוגה" אינם כאן ונשארים כמו שהיו.
 */
export interface ChoiceOption<T extends string> {
  id: T;
  /** יכול להכיל טקסט לקורא מסך בלבד */
  label: ReactNode;
  disabled?: boolean;
}

interface ChoiceProps<T extends string> {
  value: T;
  onChange: (id: T) => void;
  options: readonly ChoiceOption<T>[];
  /** שם הקבוצה לקורא מסך */
  label: string;
  disabled?: boolean;
  className?: string;
}

/** המקש ⇐ האפשרות הבאה: בכיוון הקריאה ⇐ הבאה (בעברית הראשונה מימין, אז חץ שמאלה ⇐ הבאה); למעלה ולמטה כמו ימינה ושמאלה; Home ו-End לקצוות; בקצה ממשיכים מהצד השני. null ⇐ לא מקש של הקבוצה. */
export function nextChoice(count: number, at: number, key: string, rtl: boolean): number | null {
  if (count === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = ({ ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>)[key];
  if (step === undefined) return null;
  if (at < 0) return step > 0 ? 0 : count - 1;
  return (at + step + count) % count;
}

/** הבחירה עוקבת אחרי המיקוד, ורק הנבחר נמצא בסדר הטאב (roving tabindex) */
function useRadioKeys<T extends string>(options: readonly ChoiceOption<T>[], value: T, onChange: (id: T) => void, disabled?: boolean) {
  const enabled = disabled ? [] : options.filter((o) => !o.disabled);
  const tabbable = enabled.some((o) => o.id === value) ? value : enabled[0]?.id;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const to = nextChoice(enabled.length, enabled.findIndex((o) => o.id === value), e.key, getComputedStyle(e.currentTarget).direction === "rtl");
    if (to === null) return;
    e.preventDefault();
    onChange(enabled[to].id);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')[to]?.focus();
  };
  return { tabbable, onKeyDown };
}

const RING = "ring-[1.5px] ring-inset";

export function Segmented<T extends string>({ value, onChange, options, label, disabled, className = "" }: ChoiceProps<T>) {
  const { tabbable, onKeyDown } = useRadioKeys(options, value, onChange, disabled);
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={`grid grid-flow-col auto-cols-fr gap-[3px] p-[3px] rounded-theme bg-paper ${RING} ring-ink/[.35] ${className}`}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={o.id === tabbable ? 0 : -1}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.id)}
            className={`min-h-[44px] px-2 rounded-[calc(var(--radius)-3px)] text-sm leading-tight text-center disabled:opacity-40 ${on ? `bg-paper-card text-ink font-bold ${RING} ring-ink` : "text-ink-soft font-semibold"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** טשטוש בקצה שמסתיר המשך: מחשבים משני צידי הגלילה, בלי תלות בכיוון המסמך */
function edgeMask(el: HTMLElement): CSSProperties | undefined {
  const room = el.scrollWidth - el.clientWidth;
  if (room <= 1) return undefined;
  const from = Math.abs(el.scrollLeft); // מרחק מתחילת השורה, גם ב-RTL
  const hidesStart = from > 1;
  const hidesEnd = from < room - 1;
  const rtl = getComputedStyle(el).direction === "rtl";
  const left = rtl ? hidesEnd : hidesStart;
  const right = rtl ? hidesStart : hidesEnd;
  const stops = [left ? "transparent 0" : "#000 0", "#000 2rem", "#000 calc(100% - 2rem)", right ? "transparent 100%" : "#000 100%"].join(", ");
  const mask = `linear-gradient(to right, ${stops})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/** wrap: ירידת שורה במקום גלילה, רק לחלון קטן שבו כל האפשרויות חייבות להיראות. `relative`: טקסט לקורא מסך (מוחלט) נשאר בתוך אזור הגלילה ולא מרחיב את העמוד. */
export function Chips<T extends string>({ value, onChange, options, label, disabled, className = "", wrap = false }: ChoiceProps<T> & { wrap?: boolean }) {
  const { tabbable, onKeyDown } = useRadioKeys(options, value, onChange, disabled);
  const row = useRef<HTMLDivElement>(null);
  const [mask, setMask] = useState<CSSProperties | undefined>();
  useEffect(() => {
    const el = row.current;
    if (!el || wrap) return;
    const update = () => setMask(edgeMask(el));
    update();
    const watch = new ResizeObserver(update);
    watch.observe(el);
    document.fonts?.ready.then(update);
    return () => watch.disconnect();
  }, [wrap, options.length]);
  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      onScroll={(e) => setMask(edgeMask(e.currentTarget))}
      style={mask}
      className={`flex gap-2 ${wrap ? "flex-wrap" : "relative overflow-x-auto p-1 -m-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"} ${className}`}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={o.id === tabbable ? 0 : -1}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.id)}
            className={`flex-none min-h-[44px] px-4 rounded-full text-sm disabled:opacity-40 ${on ? "bg-ink text-paper-card font-bold" : `text-ink font-semibold ${RING} ring-ink/[.35]`}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
