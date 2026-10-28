import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { embedCode, embeddableFor, embedTheme, SITE_ORIGIN } from "../lib/embed";

/** מסגרת מצומצמת להטמעה: תוכן, שורת מקור, דיווח גובה לאתר המארח, וקישורים פנימיים נפתחים באתר המלא בלשונית חדשה */
export function EmbedFrame({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
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
    <details className="mt-8 text-sm" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-ink-soft">הטמעה באתר אחר</summary>
      <p className="mt-2 text-ink-soft">מעתיקים את הקוד ומדביקים בעמוד באתר שלכם. המסך יתעדכן אוטומטית ויתאים את גובהו.</p>
      <textarea readOnly dir="ltr" value={code} rows={5} className="mt-2 w-full font-mono text-xs bg-paper-card border border-frame rounded p-2" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="mt-2 px-3 py-1.5 rounded border border-frame bg-paper-card" onClick={() => {
        void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {});
      }}>{copied ? "הועתק" : "העתקת הקוד"}</button>
    </details>
  );
}
