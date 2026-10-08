import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";

type Drag = { pointer: number; x: number; y: number; startX: number; startY: number; moved: boolean; dx: number; dy: number; width: number };
export const PARTY_POOL = "party-pool";
const targetAt = (x: number, y: number) => {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-bloc-id], [data-bloc-pool]");
  return element?.hasAttribute("data-bloc-pool") ? PARTY_POOL : element?.dataset.blocId ?? null;
};

/** אותו כרטיס זז בפועל בעכבר ובמגע; החצים מספקים חלופה במקלדת. */
export default function BlocParty({ id, name, seats, targets, current, onMove, onRemove, onHover }: {
  id: string; name: string; seats: number | null; targets: string[]; current?: string;
  onMove: (id: string, target: string) => void; onHover: (target: string | null) => void;
  onRemove?: (id: string, from: string) => void;
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
    const moved = active.current.moved;
    const to = cancel || !moved ? null : targetAt(e.clientX, e.clientY);
    active.current = null;
    setDrag(null); onHover(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (cancel || !moved) return;
    if (to && to !== PARTY_POOL && to !== current) onMove(id, to);
    else if (current && (!to || to === PARTY_POOL)) onRemove?.(id, current);
  };
  return <li data-bloc-party={id} className="flex gap-1 items-start min-w-0">
    <button type="button" data-party-drag aria-label={`${name}, ${seats ?? "ללא"} מנדטים. גררו לגוש או השתמשו בחצים ימינה ושמאלה.${current ? " להסרה גררו החוצה או לחצו Delete." : ""}`}
      className={`flex-1 min-w-0 min-h-[48px] flex flex-wrap justify-between items-center gap-2 text-sm text-start border border-paper-line bg-paper rounded-theme p-3 touch-none select-none cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${drag ? "opacity-30" : ""}`}
      onPointerDown={e => {
        if (!e.isPrimary || e.button !== 0) return;
        const r = e.currentTarget.getBoundingClientRect();
        const next = { pointer: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, dx: e.clientX - r.left, dy: e.clientY - r.top, width: r.width };
        active.current = next;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        if (active.current?.pointer !== e.pointerId) return;
        const moved = active.current.moved || Math.hypot(e.clientX - active.current.startX, e.clientY - active.current.startY) >= 6;
        const next = { ...active.current, x: e.clientX, y: e.clientY, moved };
        if (!moved) return;
        active.current = next; setDrag(next); onHover(targetAt(e.clientX, e.clientY));
      }}
      onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)}
      onLostPointerCapture={() => { active.current = null; setDrag(null); onHover(null); }}
      onKeyDown={e => {
        if (e.key === "Escape") { active.current = null; setDrag(null); onHover(null); }
        if (current && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); onRemove?.(id, current); return; }
        if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        const index = targets.indexOf(current ?? "");
        const step = e.key === "ArrowLeft" ? 1 : -1;
        const target = targets[index === -1 ? step === 1 ? 0 : targets.length - 1 : (index + step + targets.length) % targets.length];
        if (target && target !== current) {
          onMove(id, target);
          requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-bloc-id="${target}"] [data-bloc-party="${id}"] [data-party-drag]`)?.focus());
        }
      }}>
      {content}
    </button>
    {current && onRemove && <button type="button" aria-label={`הסרת ${name} מהגוש`} onClick={() => onRemove(id, current)} className="shrink-0 min-h-[48px] min-w-[44px] rounded-theme border border-paper-line text-ink-soft hover:text-warn focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">×</button>}
    {drag && createPortal(<div aria-hidden="true" data-drag-preview={id}
      className="fixed z-[100] pointer-events-none border-2 border-ink bg-paper-card text-ink rounded-theme p-3 flex justify-between gap-2 text-sm shadow-lg cursor-grabbing"
      style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width, direction: "rtl" }}>{content}</div>, document.body)}
  </li>;
}
