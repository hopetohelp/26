import { SIMPLE_POLL_MEANS } from "../lib/dataResolver";
import { useLayoutEffect, useRef, useState } from "react";
import { PARTY_IMAGES } from "../lib/partyImages";
import { PartyAvatar } from "./PartyAvatar";
import { defaultBlocs } from "../pages/guess/model";
import { useCrowdAverage } from "../lib/sources";

/**
 * תמונות הגוש (הכרעת בעלים 11.10.2026): קודם תמונת מנהיג/י הגוש, גדולה פי 1.5 מהשאר ותמיד מוצגת, ואחריה שאר המפלגות שבגוש.
 * גוש ברירת מחדל: המנהיגים הקבועים. גוש ששונה או שהמשתתף הגדיר: המפלגה הגדולה בו (ממוצע המשתתפים) כמנהיגה.
 * העיגולים חופפים מעט מימין לשמאל, והראשון על כולם וגלוי כולו (z-index יורד), ולכן כל אחד מכסה חלק קטן מהבא אחריו.
 * כמה מהשאר נכנסים נקבע לפי הרוחב הפנוי; מה שלא נכנס מסומן "+N". מפלגה בלי תמונה (הציבור החרדי, צבע שחור) לא מוצגת.
 * השמות כתובים לצד הגוש, ולכן התמונות לקישוט בלבד.
 */
/** כמה פיקסלים כל עיגול עולה על הקודם: מעט, כדי שלא יהיה צפוף */
const OVERLAP_PX = 4;
/** תמונת המנהיג/ה גדולה פי כמה מהשאר */
const LEAD_SCALE = 1.5;

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

/**
 * מי המנהיגים: המנהיגים הקבועים בגוש ברירת מחדל; אחרת המפלגה הגדולה בגוש הזה — לפי ממוצע המשתתפים (הכרעת בעלים 11.10.2026),
 * ובלי סטטיסטיקות משתתפים (עדיין לא נטענו) לפי ממוצע הסקרים — ושיש לה תמונה.
 */
export function leadsOf(id: string | undefined, lists: string[], crowdSeats?: Record<string, number> | null): string[] {
  const fixed = leadersOf(id, lists);
  if (fixed.length) return fixed;
  const seats = crowdSeats ?? SIMPLE_POLL_MEANS;
  const biggest = [...new Set(lists)].filter((p) => PARTY_IMAGES[p]).sort((a, b) => (seats[b] ?? 0) - (seats[a] ?? 0))[0];
  return biggest ? [biggest] : [];
}

/** כמה עיגולים נכנסים ברוחב הפנוי (כל עיגול עולה על הקודם ב-OVERLAP_PX); אם לא כולם, נשאר מקום ל-"+N" ותמיד נכנסים המנהיגים */
export function fitCount(widths: number[], avail: number, leads: number, chip: number): number {
  const total = (n: number) => widths.slice(0, n).reduce((a, w) => a + w, 0) - OVERLAP_PX * Math.max(0, n - 1);
  if (total(widths.length) <= avail) return widths.length;
  let n = Math.min(widths.length, Math.max(1, leads));
  while (n < widths.length - 1 && total(n + 1) + chip - OVERLAP_PX <= avail) n++;
  return Math.min(n, widths.length - 1);
}

export function BlocAvatar({ id, lists, size = 24, center = false }: { id?: string; lists: string[]; size?: number; center?: boolean }) {
  const crowd = useCrowdAverage().seats;
  const leads = leadsOf(id, lists, crowd);
  const ids = [...new Set([...leads, ...lists])].filter((p) => PARTY_IMAGES[p]);
  const big = Math.round(size * LEAD_SCALE);
  const widths = ids.map((p) => (leads.includes(p) ? big : size));
  const ref = useRef<HTMLSpanElement>(null);
  const [avail, setAvail] = useState(Infinity);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => setAvail(el.clientWidth - 3);
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!ids.length) return null;
  const n = fitCount(widths, avail, leads.length, size);
  const extra = ids.length - n;
  const ring = "rounded-full";
  const gap = { marginInlineStart: -OVERLAP_PX };
  return (
    // width:0 + min-width:100% — המלא את רוחב התא בלי להרחיב אותו בגלל מספר התמונות
    <span ref={ref} aria-hidden="true" className={`mt-1 flex items-center overflow-hidden ${center ? "justify-center" : ""}`} style={{ width: 0, minWidth: "100%", height: (leads.length ? big : size) + 8, paddingInlineStart: 3 }}>
      {ids.slice(0, n).map((p, i) => (
        <span key={p} className={`${ring} shrink-0 relative`} style={{ ...(i ? gap : null), zIndex: ids.length - i }}>
          <PartyAvatar id={p} size={widths[i]} />
        </span>
      ))}
      {extra > 0 && (
        <span className={`${ring} shrink-0 relative inline-flex items-center justify-center bg-paper-card text-ink-soft font-num font-bold`} style={{ ...gap, zIndex: 0, width: size, height: size, fontSize: size * 0.4 }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
