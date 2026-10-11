import { useLayoutEffect, useRef, useState } from "react";
import { PARTY_IMAGES } from "../lib/partyImages";
import { PartyAvatar } from "./PartyAvatar";
import { defaultBlocs } from "../pages/guess/model";

/**
 * תמונות הגוש: קודם התמונות הקבועות של גוש ברירת המחדל (תמיד מוצגות), ואחריהן שאר המפלגות שבגוש (הכרעת בעלים 11.10.2026): עיגולי פרופיל צמודים וחופפים מעט.
 * כמה מהשאר נכנסים נקבע לפי הרוחב הפנוי; מה שלא נכנס מסומן "+N". מפלגה בלי תמונה (הציבור החרדי, צבע שחור) לא מוצגת.
 * גוש ששונה או אישי מציג את ההרכב בפועל, בלי תמונות קבועות. השמות כתובים לצד הגוש, ולכן לקישוט בלבד.
 */
/** כמה פיקסלים כל עיגול עולה על הקודם: מעט, כדי שלא יהיה צפוף */
const OVERLAP_PX = 4;

/** תמונות שמוצגות תמיד בגושי ברירת המחדל (הכרעת בעלים 11.10.2026): נתניהו — הממשלה היוצאת והקואליציה; איזנקוט — האופוזיציה; שניהם — אחדות; עבאס — מפלגות ערביות */
const LEADERS: Record<string, string[]> = {
  government: ["likud"], gov: ["likud"], coalition: ["likud"],
  rest: ["yashar"], opposition: ["yashar"],
  unity: ["likud", "yashar"],
  arab: ["raam"],
};
const CANON: Record<string, string> = { coalition: "gov", opposition: "rest" };
const key = (lists: string[]) => [...new Set(lists)].sort().join(",");
/** התמונות הקבועות רק להרכב ברירת המחדל: גוש שהמשתתף שינה לא יציג מנהיג שאינו מייצג אותו */
function leadersOf(id: string | undefined, lists: string[]): string[] {
  const l = id ? LEADERS[id] : undefined;
  const base = id ? defaultBlocs().find((b) => b.id === (CANON[id] ?? id)) : undefined;
  return l && base && key(lists) === key(base.lists) ? l : [];
}

export function BlocAvatar({ id, lists, size = 24, center = false }: { id?: string; lists: string[]; size?: number; center?: boolean }) {
  const first = leadersOf(id, lists);
  const ids = [...new Set([...first, ...lists])].filter((p) => PARTY_IMAGES[p]);
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(ids.length);
  const step = size - OVERLAP_PX;
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
  const shown = all ? ids : ids.slice(0, Math.max(first.length, 1, fit - 1));
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
