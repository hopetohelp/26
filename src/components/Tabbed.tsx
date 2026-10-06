import { Suspense, type ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";

/** מסך אחד עם כמה לשוניות (הכרעת המבנה: 7 מסכים, לכל נתון בית אחד). הלשונית נשמרת בכתובת (?tab=), כדי שקישור ששותף יפתח אותה. */
export interface Tab {
  id: string;
  label: string;
  element: ReactNode;
}

export default function Tabbed({ label, tabs }: { label: string; tabs: Tab[] }) {
  const [params, setParams] = useSearchParams();
  const current = tabs.find((t) => t.id === params.get("tab")) ?? tabs[0];
  return (
    <>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5 mb-5">
        {tabs.map((t) => {
          const on = t.id === current.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setParams(t.id === tabs[0].id ? {} : { tab: t.id }, { replace: true })}
              className={`min-h-[44px] px-4 rounded-full text-sm font-bold border ${on ? "bg-ink text-paper-card border-ink" : "bg-paper-card text-ink border-paper-line hover:border-ink-faint"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        <Suspense fallback={<p className="text-ink-soft">טוען…</p>}>{current.element}</Suspense>
      </div>
    </>
  );
}

/** כתובת ישנה ⇐ המסך והלשונית החדשים, עם שמירת העוגן (#פסקה) */
export function Moved({ to, tab }: { to: string; tab?: string }) {
  const { hash } = useLocation();
  return <Navigate replace to={`${to}${tab ? `?tab=${tab}` : ""}${hash}`} />;
}
