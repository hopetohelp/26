import { useEffect, useState } from "react";

type PromoAction = { href: string; onClick?: never } | { onClick: () => void; href?: never };
type Props = PromoAction & { messages: readonly string[]; callToAction: string; label: string };

/** הזמנה אחת לשני המסכים: שלוש שניות למשפט, גובה יציב, עצירה ושם נגיש קבוע. */
export default function RotatingPromo({ messages, callToAction, label, href, onClick }: Props) {
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (motion.matches) setCurrent(0);
      else if (!paused && !hovered && !focused && messages.length > 1) timer = setInterval(() => setCurrent((i) => (i + 1) % messages.length), 3000);
    };
    sync();
    motion.addEventListener("change", sync);
    return () => { clearInterval(timer); motion.removeEventListener("change", sync); };
  }, [paused, hovered, focused, messages.length]);
  // כל הטקסט באותו גופן, וממורכז יחד עם כפתור העצירה (הכרעת בעלים 29.10.2026); כל הכרטיס לחיץ (after:inset-0)
  const content = <>
    <span aria-hidden="true" className="embed-cta-words grid items-center">
      {messages.map((message, i) => <span key={message} className="embed-cta-message" data-active={i === current} data-previous={i === (current + messages.length - 1) % messages.length}>{message}</span>)}
    </span>
    <span>{callToAction}</span>
  </>;
  const actionClass = "flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center after:absolute after:inset-0 after:content-['']";
  return (
    <div className="embed-cta relative mb-4 w-full" data-paused={paused} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
      <div className="embed-cta-action relative flex items-center justify-center gap-2 w-full rounded-theme border-2 border-signal bg-signal px-3 py-1 text-signal-ink text-sm md:text-base font-bold leading-snug hover:brightness-110">
        {href
          ? <a href={href} target="_blank" rel="noopener" aria-label={label} className={actionClass}>{content}</a>
          : <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={label} className={actionClass}>{content}</button>}
        <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? "המשך החלפת המשפטים" : "עצירת החלפת המשפטים"} title={paused ? "המשך החלפת המשפטים" : "עצירת החלפת המשפטים"} className="relative z-10 flex flex-none min-h-[44px] min-w-[44px] items-center justify-center rounded-theme text-signal-ink motion-reduce:hidden">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">{paused ? <path d="M5 3L13 8L5 13Z" /> : <><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></>}</svg>
        </button>
      </div>
    </div>
  );
}
