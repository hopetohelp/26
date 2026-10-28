import { useEffect, useState } from "react";

/** כפתור "שיתוף" בסרגל הניווט, מימין ל-AI (הכרעת בעלים 28.10.2026): המסך שיש לו שיתוף רושם כאן את הפעולה, והסרגל מציג את הכפתור כל עוד המסך פתוח */
export type NavShare = { onClick: () => void; disabled: boolean } | null;
let current: NavShare = null;
const listeners = new Set<(v: NavShare) => void>();
export function setNavShare(v: NavShare) {
  current = v;
  listeners.forEach(fn => fn(v));
}
export function useNavShare(): NavShare {
  const [v, setV] = useState(current);
  useEffect(() => { listeners.add(setV); setV(current); return () => { listeners.delete(setV); }; }, []);
  return v;
}
/** רישום כפתור השיתוף של המסך; מוסר ביציאה מהמסך */
export function useRegisterNavShare(onClick: () => void, disabled: boolean) {
  useEffect(() => { setNavShare({ onClick, disabled }); }, [onClick, disabled]);
  useEffect(() => () => setNavShare(null), []);
}
