import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * יציאה ממסך בלי שמירה (הכרעת בעלים 02.11.2026): יציאה אינה שומרת כלום; לפני יציאה עם שינויים שלא נשמרו — הודעה,
 * ושלוש אפשרויות: להישאר · לשמור ולצאת · לצאת בלי לשמור.
 * תופס מעבר דרך קישור או כפתור ניווט באתר (קישור עם href), וסגירה או רענון של הלשונית (חלון הדפדפן הרגיל).
 */
export default function LeaveGuard({ dirty, onSave }: { dirty: boolean; onSave: () => Promise<boolean> }) {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href === location.hash || href.startsWith("mailto:")) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(a.href);
    };
    const unload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("beforeunload", unload); };
  }, []);

  if (!target) return null;
  const go = () => { const t = target; setTarget(null); dirtyRef.current = false; location.href = t; };
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4" onClick={(e) => e.target === e.currentTarget && !busy && setTarget(null)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="leave-title" className="bg-paper-card text-ink w-full md:max-w-md rounded-t-theme md:rounded-theme p-5 space-y-3">
        <h2 id="leave-title" className="text-xl font-display leading-tight">יוצאים בלי לשמור</h2>
        <p className="text-sm">השינויים במסך הזה לא נשמרו. ביציאה הם לא יישמרו.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="f-btn pri" autoFocus disabled={busy} onClick={() => setTarget(null)}>להישאר</button>
          <button type="button" className="f-btn" disabled={busy} onClick={async () => { setBusy(true); const ok = await onSave(); setBusy(false); if (ok) go(); }}>לשמור ולצאת</button>
          <button type="button" className="f-btn !text-warn" disabled={busy} onClick={go}>לצאת בלי לשמור</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
