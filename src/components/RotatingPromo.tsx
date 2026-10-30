import { useEffect, useState } from "react";

type PromoAction = { href: string; onClick?: never } | { onClick: () => void; href?: never };
type Props = PromoAction & { messages: readonly string[]; callToAction: string; label: string };

/** הזמנה אחת לשני המסכים: שלוש שניות למשפט, גובה יציב ושם נגיש קבוע; ריחוף או מיקוד עוצרים את ההחלפה.
 * בטלפון (הכרעת בעלים 30.10.2026): שורה אחת בלבד, והקריאה לפעולה היא עוד משפט מתחלף; בלי כפתור עצירה */
export default function RotatingPromo({ messages, callToAction, label, href, onClick }: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [current, setCurrent] = useState(0);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const lines = narrow ? [...messages, callToAction] : messages;
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (motion.matches) setCurrent(0);
      else if (!hovered && !focused && lines.length > 1) timer = setInterval(() => setCurrent((i) => (i + 1) % lines.length), 3000);
    };
    sync();
    motion.addEventListener("change", sync);
    return () => { clearInterval(timer); motion.removeEventListener("change", sync); };
  }, [hovered, focused, lines.length]);
  const at = current % lines.length;
  // כל הטקסט באותו גופן וממורכז (הכרעת בעלים 29.10.2026); כל הכרטיס לחיץ (after:inset-0)
  const content = <>
    <span aria-hidden="true" className="embed-cta-words grid items-center min-w-0 max-w-full">
      {lines.map((line, i) => <span key={line} className="embed-cta-message truncate" data-active={i === at} data-previous={i === (at + lines.length - 1) % lines.length}>{line}</span>)}
    </span>
    {!narrow && <span>{callToAction}</span>}
  </>;
  const actionClass = `flex items-center justify-center gap-x-2 gap-y-0.5 text-center min-w-0 max-w-full after:absolute after:inset-0 after:content-[''] ${narrow ? "flex-nowrap whitespace-nowrap" : "flex-wrap"}`;
  return (
    <div className="embed-cta relative mb-4 w-full" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
      <div className="embed-cta-action relative flex items-center justify-center w-full min-h-[44px] rounded-theme border-2 border-signal bg-signal px-2 min-[380px]:px-3 py-1 text-signal-ink text-xs min-[380px]:text-sm md:text-base font-bold leading-snug hover:brightness-110">
        {href
          ? <a href={href} target="_blank" rel="noopener" aria-label={label} className={actionClass}>{content}</a>
          : <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={label} className={actionClass}>{content}</button>}
      </div>
    </div>
  );
}
