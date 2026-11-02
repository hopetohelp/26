import { lazy, Suspense, useState, type ReactNode } from "react";
import type { FlowSankeyProps } from "./FlowSankey";

const FlowSankey = lazy(() => import("./FlowSankey"));

/** כפתור "הצגה בגרף": גרף זרימה במקום הכרטיסים, ולחיצה נוספת מחזירה (הכרעות בעלים 30.10.2026) */
/** defaultOn: הגרף פתוח מראש והכרטיסים בלחיצה (הכרעת בעלים 02.11.2026: "ברירת המחדל תהיה גרף") */
export default function GraphSwitch({ graph, children, defaultOn = false }: { graph: FlowSankeyProps; children: ReactNode; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <>
      <button type="button" aria-pressed={on} onClick={() => setOn((g) => !g)}
        className={`rounded-full border border-signal px-4 min-h-[44px] font-bold ${on ? "bg-signal text-signal-ink" : "text-signal"}`}>הצגה בגרף</button>
      {on ? <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><FlowSankey {...graph} /></Suspense> : children}
    </>
  );
}
