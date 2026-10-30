import { lazy, Suspense, useState, type ReactNode } from "react";
import type { FlowSankeyProps } from "./FlowSankey";

const FlowSankey = lazy(() => import("./FlowSankey"));

/** כפתור "הצגה בגרף": גרף זרימה במקום הכרטיסים, ולחיצה נוספת מחזירה (הכרעות בעלים 30.10.2026) */
export default function GraphSwitch({ graph, children }: { graph: FlowSankeyProps; children: ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <>
      <button type="button" aria-pressed={on} onClick={() => setOn((g) => !g)}
        className={`rounded-full border border-signal px-4 min-h-[44px] font-bold ${on ? "bg-signal text-signal-ink" : "text-signal"}`}>הצגה בגרף</button>
      {on ? <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><FlowSankey {...graph} /></Suspense> : children}
    </>
  );
}
