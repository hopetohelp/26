import { createContext, Suspense, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";

/** מסך אחד עם כמה לשוניות (הכרעת המבנה: 7 מסכים, לכל נתון בית אחד). הלשונית נשמרת בכתובת (?tab=), כדי שקישור ששותף יפתח אותה. */
export interface Tab {
  id: string;
  label: string;
  element: ReactNode;
}

/** aliases: לשונית שאוחדה לתוך אחרת ⇐ קישורים ישנים (?tab=forecast) נפתחים בלשונית החדשה */
/** שורת הלשוניות של המסך. `Split` בתוך הלשונית "תופס" אותה ומציג אותה בראש הטור הצר (הכרעת בעלים 8.10.2026). */
const TabsSlot = createContext<{ tabs: ReactNode; claim: (on: boolean) => void } | null>(null);

/** בתוך `Split`: שורת הלשוניות של המסך, אם יש, ותופסת אותה כדי ש-Tabbed לא יציג אותה גם מעל */
export function useTabsSlot(): ReactNode {
  const slot = useContext(TabsSlot);
  const claim = slot?.claim;
  useLayoutEffect(() => {
    if (!claim) return;
    claim(true);
    return () => claim(false);
  }, [claim]);
  return slot?.tabs ?? null;
}

export default function Tabbed({ label, tabs, aliases = {} }: { label: string; tabs: Tab[]; aliases?: Record<string, string> }) {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab") ?? "";
  const current = tabs.find((t) => t.id === (aliases[asked] ?? asked)) ?? tabs[0];
  const [claimed, setClaimed] = useState(0);
  const claim = useCallback((on: boolean) => setClaimed((n) => n + (on ? 1 : -1)), []);
  const list = (
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
  );
  return (
    <TabsSlot.Provider value={{ tabs: list, claim }}>
      {!claimed && list}
      <div role="tabpanel">
        <Suspense fallback={<p className="text-ink-soft">טוען…</p>}>{current.element}</Suspense>
      </div>
    </TabsSlot.Provider>
  );
}

/** כתובת ישנה ⇐ המסך והלשונית החדשים, עם שמירת העוגן (#פסקה) */
export function Moved({ to, tab }: { to: string; tab?: string }) {
  const { hash } = useLocation();
  return <Navigate replace to={`${to}${tab ? `?tab=${tab}` : ""}${hash}`} />;
}
