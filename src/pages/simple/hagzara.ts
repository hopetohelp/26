import { useEffect } from "react";
import { HAGZARA_GROUP_ID } from "../../lib/simpleSources";
import { refImageUrl } from "../../lib/groupLink";
import type { useSession } from "../guess/useCrowd";
/** חבר בגזרה (חברות מהשרת): כתובת הקבוצה והסמל לשיתוף, או null */
export function useHagzara(session: ReturnType<typeof useSession>) {
  const g = session.me?.groups?.find(x => x.id === HAGZARA_GROUP_ID);
  return g ? { slug: g.slug ?? "hagzara", logoUrl: refImageUrl(g) } : null;
}
/** צבעי הגזרה בכל האתר לחברי הקבוצה (הכרעת בעלים 23.10.2026): data-group על השורש, והטוקנים מתחלפים ב-index.css */
export function useHagzaraTheme(session: ReturnType<typeof useSession>) {
  const member = !!useHagzara(session);
  const { refresh } = session;
  // חברות מתעדכנת בחזרה לאתר (הצטרפות או עזיבה בלשונית אחרת)
  useEffect(() => { const again = () => void refresh(); window.addEventListener("focus", again); return () => window.removeEventListener("focus", again); }, [refresh]);
  useEffect(() => {
    const root = document.documentElement;
    if (member) root.dataset.group = "hagzara"; else delete root.dataset.group;
  }, [member]);
  return member;
}
