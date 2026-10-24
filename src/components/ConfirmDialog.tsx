import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Btn } from "../pages/guess/ui";

/**
 * חלון "האם אתם בטוחים?" לפעולה שמוחקת (הכרעת בעלים 24.10.2026): החלפת רשימת המיילים, מחיקת כל חברי הקבוצה ומחיקת הקבוצה.
 * בטלפון מלמטה, במחשב במרכז. Esc, לחיצה ברקע או "ביטול" סוגרים בלי לעשות כלום; המיקוד נכנס ל"ביטול" וחוזר לכפתור שפתח.
 */
export default function ConfirmDialog({ title, children, confirm, busy = false, onConfirm, onCancel }: {
  title: string;
  children: ReactNode;
  confirm: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelBox = useRef<HTMLDivElement>(null);
  const close = () => { if (!busy) onCancel(); };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    cancelBox.current?.querySelector("button")?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); back?.focus(); };
  }, []);
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" className="bg-paper-card text-ink w-full md:max-w-md rounded-t-theme md:rounded-theme p-5 space-y-3 max-h-[92vh] overflow-y-auto">
        <h2 id="confirm-title" className="text-xl font-display leading-tight">{title}</h2>
        <div id="confirm-body" className="text-sm space-y-2">{children}</div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Btn kind="danger" disabled={busy} onClick={onConfirm}>{confirm}</Btn>
          <div ref={cancelBox} className="contents"><Btn disabled={busy} onClick={close}>ביטול</Btn></div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
