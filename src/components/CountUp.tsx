import { useLayoutEffect, useState } from "react";

/**
 * מספר שעולה מאפס עד ערכו בפתיחת המסך (הכרעת בעלים 11.10.2026: הדו-קרב בבית), פעם אחת, באטה בסוף.
 * הרינדור הראשון הוא הערך הסופי (בדיקות, קורא מסך וללא JavaScript); בדפדפן מאפסים לפני הציור הראשון, כך שאין הבהוב.
 * `prefers-reduced-motion`: בלי ספירה, הערך הסופי מיד.
 */
export default function CountUp({ value, format = String, duration = 1100 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  useLayoutEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const decimals = Number.isInteger(value) ? 0 : 1;
    const round = (n: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;
    let raf = 0;
    const t0 = performance.now();
    setShown(0);
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      setShown(k >= 1 ? value : round(value * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}
