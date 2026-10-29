import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { embedCode, embeddableFor, SITE_ORIGIN } from "../lib/embed";
import { useMode } from "../lib/theme";
import { pingEmbed } from "../lib/visits";
import InfoTip from "./InfoTip";
import { Segmented } from "./Choice";
import RotatingPromo from "./RotatingPromo";
import ScreenFooter from "./ScreenFooter";

const CHANGES_MESSAGES = [
  "חושבים שאתם יודעים מה השתנה מבחירות קודמות?",
  "סקרנים לראות מי התחזק — ומאיפה הגיעו המצביעים?",
  "מאיפה הגיעו מצביעי הציבור החרדי? בואו לגלות.",
  "האם מצביעי ש״ס הצביעו למפלגות אחרות או נשארו בבית?",
  "מי המפלגה שכן לקחה קולות מגוש הימין?",
  "כמה אחוז ממצביעי עופר וינטר הגיעו מגוש הימין?",
  "האם ג׳ התחזקה רק בקולות או גם באחוזים?",
];

/** מסגרת מצומצמת להטמעה: תוכן, שורת מקור, דיווח גובה לאתר המארח, וקישורים פנימיים נפתחים באתר המלא בלשונית חדשה */
export function EmbedFrame({ children }: { children: ReactNode }) {
  useMode();
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (window.parent !== window) pingEmbed(pathname === "/changes" ? "changes" : "results-2026", "view");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (window.parent === window) return;
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.documentElement.scrollHeight);
      if (h === last) return;
      last = h;
      window.parent.postMessage({ type: "elections26:height", height: h }, "*");
    };
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#") && !href.startsWith("#/")) return; // עוגן באותו מסך
      e.preventDefault();
      const url = href.startsWith("#/") ? `${SITE_ORIGIN}/${href}` : a.href;
      window.open(url, "_blank", "noopener");
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  const fullParams = new URLSearchParams(search);
  fullParams.delete("embed");
  fullParams.delete("theme");
  const full = `${SITE_ORIGIN}/#${pathname}${fullParams.size ? `?${fullParams}` : ""}`;
  return (
    <div data-embed className="bg-paper text-ink">
      <main id="main" className="w-full px-3 md:px-4 py-4">
        {pathname === "/results-2026" && <RotatingPromo messages={CHANGES_MESSAGES} callToAction="כנסו וגלו את הסיפור מאחורי המנדטים!" label="מה השתנה מבחירות קודמות? כנסו וגלו את הסיפור מאחורי המנדטים!" href={`${SITE_ORIGIN}/#/changes`} />}
        {children}
        <ScreenFooter sourceUrl={full}><EmbedButton /></ScreenFooter>
      </main>
    </div>
  );
}

/** כפתור "הטמעה באתר אחר" — רק במסכים שמותר להטמיע */
export function EmbedButton() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const target = embeddableFor(pathname, params.get("tab"));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"light" | "auto">("light");
  if (!target) return null;
  const code = embedCode(target, theme);
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" className="text-ink-soft underline" aria-expanded={open} aria-controls="embed-code" onClick={() => setOpen(!open)}>הטמעה באתר אחר</button>
        <InfoTip label="הסבר: איך מטמיעים">
          <strong>איך מטמיעים?</strong> מעתיקים את הקוד ומדביקים אותו בעמוד באתר, במקום שבו רוצים שהמסך יופיע.
          בוורדפרס — בלוק "HTML מותאם אישית". בוויקס — "הטמעה" ← "קוד HTML". בגוגל סייטס — "הטמעה" ← "קוד הטמעה". בשאר המערכות — מצב עריכת HTML של העמוד.
          המסך מתעדכן לבד ומתאים את גובהו. אם המערכת חוסמת את השורה השנייה (סקריפט), ההטמעה עדיין עובדת, אבל בגובה קבוע, ואפשר לשנות אותו ב-min-height.
          ההטמעה חינמית ומותרת לכל אתר; בתחתית המסך מופיע קישור לאתר המלא.
        </InfoTip>
      </div>
      {open && <div id="embed-code" className="order-last basis-full w-full text-ink">
        <Segmented value={theme} onChange={(value) => { setTheme(value); setCopied(false); }} label="תצוגת ההטמעה" className="mt-2 w-fit" options={[
          { id: "light", label: "בהיר" },
          { id: "auto", label: "לפי העדפת המשתמש" },
        ]} />
        <p className="mt-2 text-ink-soft">לפי העדפת המשתמש: הבחירה השמורה באתר, ואם אין — לפי הגדרת המכשיר.</p>
        <textarea readOnly dir="ltr" value={code} rows={5} className="mt-2 w-full font-mono text-xs bg-paper-card border border-frame rounded p-2" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="mt-2 px-3 py-1.5 rounded border border-frame bg-paper-card" onClick={() => {
          pingEmbed(target.path === "/changes" ? "changes" : "results-2026", "copy");
          void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {});
        }}>{copied ? "הועתק" : "העתקת הקוד"}</button>
      </div>}
    </>
  );
}
