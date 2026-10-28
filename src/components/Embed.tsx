import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { embedCode, embeddableFor, embedTheme, SITE_ORIGIN } from "../lib/embed";
import { pingEmbed } from "../lib/visits";
import InfoTip from "./InfoTip";

/** מסגרת מצומצמת להטמעה: תוכן, שורת מקור, דיווח גובה לאתר המארח, וקישורים פנימיים נפתחים באתר המלא בלשונית חדשה */
export function EmbedFrame({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (window.parent !== window) pingEmbed(pathname === "/past" ? "changes" : "results-2026", "view");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = embedTheme();
    if (t === "dark") document.documentElement.dataset.dark = "";
    else if (t === "light") delete document.documentElement.dataset.dark;
  }, []);
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
      if (!a || a.target === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#") && !href.startsWith("#/")) return; // עוגן באותו מסך
      e.preventDefault();
      const url = href.startsWith("#/") ? `${SITE_ORIGIN}/${href}` : a.href;
      window.open(url, "_blank", "noopener");
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  const full = `${SITE_ORIGIN}/#${pathname}${search.replace(/[?&]embed=1|[?&]theme=(light|dark)/g, "").replace(/^&/, "?")}`;
  return (
    <div data-embed className="bg-paper text-ink">
      <main id="main" className="w-full px-3 md:px-4 py-4">{children}</main>
      <p className="px-3 md:px-4 pb-3 text-xs text-ink-soft">
        מקור: <a href={full} target="_blank" rel="noopener" className="underline">בחירות 2026 — 26.hopetohelp.net</a>
      </p>
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
  if (!target) return null;
  const code = embedCode(target);
  return (
    <div className="mt-8 text-sm">
      <div className="flex items-center gap-2">
        <button type="button" className="text-ink-soft underline" aria-expanded={open} aria-controls="embed-code" onClick={() => setOpen(!open)}>הטמעה באתר אחר</button>
        <InfoTip label="הסבר: איך מטמיעים">
          <strong>איך מטמיעים?</strong> מעתיקים את הקוד ומדביקים אותו בעמוד באתר, במקום שבו רוצים שהמסך יופיע.
          בוורדפרס — בלוק "HTML מותאם אישית". בוויקס — "הטמעה" ← "קוד HTML". בגוגל סייטס — "הטמעה" ← "קוד הטמעה". בשאר המערכות — מצב עריכת HTML של העמוד.
          המסך מתעדכן לבד ומתאים את גובהו. אם המערכת חוסמת את השורה השנייה (סקריפט), ההטמעה עדיין עובדת, אבל בגובה קבוע, ואפשר לשנות אותו ב-min-height.
          ההטמעה חינמית ומותרת לכל אתר; בתחתית המסך מופיע קישור לאתר המלא.
        </InfoTip>
      </div>
      {open && <div id="embed-code">
        <textarea readOnly dir="ltr" value={code} rows={5} className="mt-2 w-full font-mono text-xs bg-paper-card border border-frame rounded p-2" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="mt-2 px-3 py-1.5 rounded border border-frame bg-paper-card" onClick={() => {
          pingEmbed(target.path === "/past" ? "changes" : "results-2026", "copy");
          void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {});
        }}>{copied ? "הועתק" : "העתקת הקוד"}</button>
      </div>}
    </div>
  );
}
