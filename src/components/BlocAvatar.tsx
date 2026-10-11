import { useLayoutEffect, useRef, useState } from "react";
import { PARTY_IMAGES } from "../lib/partyImages";
import { PartyAvatar } from "./PartyAvatar";

/**
 * תמונות כל המפלגות שבגוש (הכרעת בעלים 11.10.2026, מחליפה את "תמונה אחת לגוש"): עיגולי פרופיל צמודים וחופפים מעט.
 * כמה נכנסים נקבע לפי הרוחב הפנוי; מה שלא נכנס מסומן "+N". מפלגה בלי תמונה (הציבור החרדי, צבע שחור) לא מוצגת.
 * מציגה את ההרכב בפועל, ולכן נכון גם לגוש שהמשתתף שינה ולגוש אישי. השמות כתובים לצד הגוש, ולכן לקישוט בלבד.
 */
const OVERLAP = 0.32;

export function BlocAvatar({ lists, size = 24, center = false }: { lists: string[]; size?: number; center?: boolean }) {
  const ids = [...new Set(lists)].filter((id) => PARTY_IMAGES[id]);
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(ids.length);
  const step = Math.round(size * (1 - OVERLAP));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => setFit(Math.max(1, Math.floor((el.clientWidth - size) / step) + 1));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size, step]);
  if (!ids.length) return null;
  const all = fit >= ids.length;
  const shown = all ? ids : ids.slice(0, Math.max(1, fit - 1));
  const extra = ids.length - shown.length;
  const ring = "rounded-full shadow-[0_0_0_1.5px_rgb(var(--card))]";
  const gap = { marginInlineStart: -(size - step) };
  return (
    // width:0 + min-width:100% — המלא את רוחב התא בלי להרחיב אותו בגלל מספר התמונות
    <span ref={ref} aria-hidden="true" className={`mt-1 flex items-center overflow-hidden ${center ? "justify-center" : ""}`} style={{ width: 0, minWidth: "100%", height: size + 8, paddingInlineStart: 3 }}>
      {shown.map((id, i) => (
        <span key={id} className={`${ring} shrink-0`} style={i ? gap : undefined}>
          <PartyAvatar id={id} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span className={`${ring} shrink-0 inline-flex items-center justify-center bg-paper-card text-ink-soft font-num font-bold`} style={{ ...gap, width: size, height: size, fontSize: size * 0.4 }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
