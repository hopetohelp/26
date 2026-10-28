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
  const content = <>
    <span aria-hidden="true" className="embed-cta-words grid items-center text-base md:text-xl font-bold leading-snug">
      {messages.map((message, i) => <span key={message} className="embed-cta-message" data-active={i === current} data-previous={i === (current + messages.length - 1) % messages.length}>{message}</span>)}
    </span>
    <strong className="block mt-2 text-sm font-extrabold">{callToAction}</strong>
  </>;
  const actionClass = "embed-cta-action block w-full rounded-theme border-2 border-signal bg-signal px-12 py-4 text-center text-signal-ink hover:brightness-110";
  return (
    <div className="embed-cta relative mb-4 w-full" data-paused={paused} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
      {href
        ? <a href={href} target="_blank" rel="noopener" aria-label={label} className={actionClass}>{content}</a>
        : <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={label} className={actionClass}>{content}</button>}
      <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? "המשך החלפת המשפטים" : "עצירת החלפת המשפטים"} title={paused ? "המשך החלפת המשפטים" : "עצירת החלפת המשפטים"} className="absolute top-1 end-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-theme text-signal-ink motion-reduce:hidden">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">{paused ? <path d="M5 3L13 8L5 13Z" /> : <><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></>}</svg>
      </button>
    </div>
  );
}
