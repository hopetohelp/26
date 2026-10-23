import { useEffect } from "react";
import { resetLinkJoins, syncLinkJoins } from "../../lib/linkJoin";
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
  const { refresh, token } = session;
  const who = session.me?.participant;
  // הצטרפות דרך קישור קבוצה נשלחת לחשבון המחובר (גם אחרי הרשמה מאוחרת); חשבון אחר בדפדפן ⇐ נשלחת שוב
  useEffect(() => {
    if (!token || !who) return;
    try { if (localStorage.getItem("elections26.link-joins-for") !== who) { resetLinkJoins(); localStorage.setItem("elections26.link-joins-for", who); } } catch { /* בלי אחסון */ }
    void syncLinkJoins(token).then(sent => { if (sent) void refresh(); });
  }, [token, who, refresh]);
  // חברות מתעדכנת בחזרה לאתר (הצטרפות או עזיבה בלשונית אחרת)
  useEffect(() => { const again = () => void refresh(); window.addEventListener("focus", again); return () => window.removeEventListener("focus", again); }, [refresh]);
  useEffect(() => {
    const root = document.documentElement;
    if (member) root.dataset.group = "hagzara"; else delete root.dataset.group;
  }, [member]);
  return member;
}
