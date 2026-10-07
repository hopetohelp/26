import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";

type Drag = { pointer: number; x: number; y: number; dx: number; dy: number; width: number };
const targetAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-bloc-id]") as HTMLElement | null)?.dataset.blocId ?? null;

/** אותו כרטיס זז בפועל בעכבר ובמגע; החצים מספקים חלופה במקלדת. */
export default function BlocParty({ id, name, seats, targets, current, onMove, onHover }: {
  id: string; name: string; seats: number | null; targets: string[]; current?: string;
  onMove: (id: string, target: string) => void; onHover: (target: string | null) => void;
}) {
  const active = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame: number;
    const tick = () => {
      const y = active.current?.y;
      if (y !== undefined) {
        const edge = 80;
        const speed = y < edge ? -8 : y > window.innerHeight - edge ? 8 : 0;
        if (speed) {
          window.scrollBy(0, speed);
          onHover(targetAt(active.current!.x, y));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging, onHover]);
  const content = <><b className="min-w-0 max-w-full [overflow-wrap:anywhere]">{name}</b><span className="tabular shrink-0">{seats ?? "—"} מנדטים</span></>;
  const finish = (e: PointerEvent<HTMLButtonElement>, cancel = false) => {
    if (active.current?.pointer !== e.pointerId) return;
    const to = cancel ? null : targetAt(e.clientX, e.clientY);
    active.current = null;
    setDrag(null); onHover(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (to && to !== current) onMove(id, to);
  };
  return <li data-bloc-party={id}>
    <button type="button" aria-label={`${name}, ${seats ?? "ללא"} מנדטים. גררו לגוש אחר או השתמשו בחצים ימינה ושמאלה.`}
      className={`w-full min-h-[48px] flex flex-wrap justify-between items-center gap-2 text-sm text-start border border-paper-line bg-paper rounded-theme p-3 touch-none select-none cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${drag ? "opacity-30" : ""}`}
      onPointerDown={e => {
        if (!e.isPrimary || e.button !== 0) return;
        const r = e.currentTarget.getBoundingClientRect();
        const next = { pointer: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, width: r.width };
        active.current = next; setDrag(next);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        if (active.current?.pointer !== e.pointerId) return;
        const next = { ...active.current, x: e.clientX, y: e.clientY };
        active.current = next; setDrag(next); onHover(targetAt(e.clientX, e.clientY));
      }}
      onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)}
      onLostPointerCapture={() => { active.current = null; setDrag(null); onHover(null); }}
      onKeyDown={e => {
        if (e.key === "Escape") { active.current = null; setDrag(null); onHover(null); }
        if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        const index = targets.indexOf(current ?? "");
        const step = e.key === "ArrowLeft" ? 1 : -1;
        const target = targets[(index + step + targets.length) % targets.length];
        if (target && target !== current) {
          onMove(id, target);
          requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-bloc-party="${id}"] button`)?.focus());
        }
      }}>
      {content}
    </button>
    {drag && createPortal(<div aria-hidden="true" data-drag-preview={id}
      className="fixed z-[100] pointer-events-none border-2 border-ink bg-paper-card text-ink rounded-theme p-3 flex justify-between gap-2 text-sm shadow-lg cursor-grabbing"
      style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width, direction: "rtl" }}>{content}</div>, document.body)}
  </li>;
}
