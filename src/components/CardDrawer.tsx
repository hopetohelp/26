import { useEffect, useState, type ReactNode } from "react";

const seenKey = (id: string) => `elections26.drawerSeen.${id}`;
const wasSeen = (id?: string) => { if (!id) return true; try { return localStorage.getItem(seenKey(id)) === "1"; } catch { return false; } };

/**
 * מגירה בצורת כרטיס עם מסגרת (הכרעת בעלים 11.10.2026): סגורה כברירת מחדל, בשורה הסגורה רק הכותרת והסימן.
 * אותו עיצוב כמו `BlocsDrawer`, לכרטיס ההצבעה בראש "הכנסת שלי".
 * `pendingTag` + `seenId`: תג על המגירה הסגורה (למשל "מחכה לתשובה") כל עוד המשתתף לא נכנס אליה; הוא נעלם בכניסה הראשונה ונזכר בדפדפן, ובזמן שהתג מוצג אין נקודת "לא נשמר".
 * `badge`: תג קבוע על כותרת המגירה, פתוחה וסגורה (למשל "האחרונה — נספרת").
 * `actions` — כפתורים בשורת הכותרת, רק כשהמגירה פתוחה. `open`/`onOpenChange` — שליטה מבחוץ (בלי זה המגירה מנהלת את עצמה).
 */
export default function CardDrawer({ title, actions, dot, badge, pendingTag, seenId, open, onOpenChange, className = "mt-8 mb-5", children }: {
  title: string; actions?: ReactNode; dot?: boolean; badge?: string; pendingTag?: string; seenId?: string; open?: boolean; onOpenChange?: (v: boolean) => void; className?: string; children: ReactNode;
}) {
  const [own, setOwn] = useState(false);
  const [seen, setSeen] = useState(() => wasSeen(seenId));
  const expanded = open ?? own;
  // כניסה למגירה (גם פתיחה מקישור) ⇐ התג נעלם ונזכר בדפדפן
  useEffect(() => {
    if (!expanded || !seenId) return;
    setSeen(true);
    try { localStorage.setItem(seenKey(seenId), "1"); } catch { /* ללא אחסון — התג יחזור בטעינה הבאה */ }
  }, [expanded, seenId]);
  const toggle = () => {
    const v = !expanded;
    setOwn(v);
    onOpenChange?.(v);
  };
  const tag = !!pendingTag && !expanded && !seen;
  return (
    <section aria-label={title} className={`c-card-drawer bg-paper-card [--mk-bg:var(--card)] border border-paper-line rounded-theme px-4 md:px-5 ${className}`}>
      <div className="flex items-center gap-2 min-h-[56px]">
        <h2 className="flex-1 min-w-0 text-base font-bold leading-tight">
          <button type="button" aria-expanded={expanded} onClick={toggle} className="w-full min-h-[56px] text-start font-bold flex items-center gap-2">
            {title}
            {badge && <span className="shrink-0 text-xs font-bold border border-ink rounded-full px-2 py-0.5">{badge}</span>}
            {tag && <span className="shrink-0 text-xs font-bold border border-warn/40 bg-warn-soft text-warn rounded-full px-2.5 py-0.5">{pendingTag}</span>}
            {dot && !tag && <span aria-label="(לא נשמר)" className="w-2 h-2 rounded-full bg-warn shrink-0" />}
          </button>
        </h2>
        {expanded && actions}
        <button type="button" aria-label={expanded ? "סגירה" : "פתיחה"} aria-expanded={expanded} onClick={toggle} className="min-h-[56px] w-8 text-ink-soft text-xl">
          <span aria-hidden="true" className={`inline-block transition-transform ${expanded ? "rotate-45" : ""}`}>+</span>
        </button>
      </div>
      {expanded && <div className="pb-4">{children}</div>}
    </section>
  );
}
