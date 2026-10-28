import { nextChoice } from "./Choice";
import { isEmbed } from "../lib/embed";
import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useState, useId, useRef, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

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

/**
 * anchors: עוגן (#id) שנמצא בלשונית אחרת ⇐ הלשונית שלו. קישור ישן כמו /method#privacy פותח את הלשונית הנכונה ואז גולל לעוגן.
 * הלשונית שנבחרה במפורש (?tab=) גוברת.
 */
export default function Tabbed({ label, tabs, aliases = {}, anchors = {} }: { label: string; tabs: Tab[]; aliases?: Record<string, string>; anchors?: Record<string, string> }) {
  const [params, setParams] = useSearchParams();
  const tabId = useId();
  const keyboardSelection = useRef(false);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const asked = params.get("tab") ?? "";
  const anchorTab = !asked ? anchors[decodeURIComponent(hash.slice(1))] : undefined;
  const firstTab = tabs[0].id;
  useEffect(() => {
    if (anchorTab && anchorTab !== firstTab) navigate({ search: `?tab=${anchorTab}`, hash }, { replace: true });
  }, [anchorTab, firstTab, hash, navigate]);
  const current = tabs.find((t) => t.id === (aliases[asked] ?? asked)) ?? tabs[0];
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === firstTab) next.delete("tab"); else next.set("tab", id);
    setParams(next, { replace: true });
  };
  const [claimed, setClaimed] = useState(0);
  const claim = useCallback((on: boolean) => setClaimed((n) => n + (on ? 1 : -1)), []);
  useLayoutEffect(() => {
    if (keyboardSelection.current) document.getElementById(`${tabId}-${current.id}`)?.focus();
  }, [current.id, claimed, tabId]);
  const list = (
      <div role="tablist" aria-label={label} className="c-page-tabs flex flex-wrap gap-1.5 mb-5" onKeyDown={e => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const next = nextChoice(tabs.length, tabs.findIndex(t => t.id === current.id), e.key, getComputedStyle(e.currentTarget).direction === "rtl");
        if (next === null) return;
        e.preventDefault(); keyboardSelection.current = true; select(tabs[next].id);
      }}>
        {tabs.map((t) => {
          const on = t.id === current.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${tabId}-${t.id}`}
              aria-controls={`${tabId}-panel`}
              tabIndex={on ? 0 : -1}
              aria-selected={on}
              onClick={() => { keyboardSelection.current = false; select(t.id); }}
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
      {!claimed && !isEmbed() && list}
      <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${current.id}`}>
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
