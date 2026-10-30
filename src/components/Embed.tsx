import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { embedCode, embedScreenOf, embedTargetsFor, SITE_ORIGIN } from "../lib/embed";
import { useMode } from "../lib/theme";
import { pingEmbed } from "../lib/visits";
import { FLOW_SHARE_CTA, FLOW_SHARE_MESSAGES } from "../lib/voterFlow";
import InfoTip from "./InfoTip";
import { Segmented } from "./Choice";
import RotatingPromo from "./RotatingPromo";
import ScreenFooter from "./ScreenFooter";

const FlowShare = lazy(() => import("./FlowShare"));
/** בזמן שחלון השיתוף פתוח החלון המוטמע מתקצר לגובה שנראה במלואו ואתר המארח גולל אליו */
const SHARE_HEIGHT = 900;

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
  // יצירת פוסט מתוך ההטמעה (הכרעת בעלים 30.10.2026): במסך "מה השתנה" ובגרפי המעבר, כחלון נפתח בלי לצאת מההטמעה
  const shareable = pathname === "/changes" || pathname === "/flow-graphs";
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    if (window.parent !== window) pingEmbed(embedScreenOf(pathname), "view");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (window.parent === window) return;
    if (sharing) { window.parent.postMessage({ type: "elections26:height", height: SHARE_HEIGHT, scroll: true }, "*"); return; }
    let last = 0;
    const send = () => {
      // גובה התוכן עצמו — לא גובה המסמך, שאינו קטן מגובה החלון ולכן לא מאפשר להתקצר
      const h = Math.ceil(document.querySelector("[data-embed]")?.getBoundingClientRect().height ?? document.documentElement.scrollHeight);
      if (h === last) return;
      last = h;
      window.parent.postMessage({ type: "elections26:height", height: h }, "*");
    };
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    const box = document.querySelector("[data-embed]");
    if (box) ro.observe(box);
    send();
    return () => ro.disconnect();
  }, [sharing]);
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
  fullParams.delete("show");
  // גרפי המעבר הם תצוגה של מסך "מה השתנה" — הקישור חוזר אליו
  const full = pathname === "/flow-graphs" ? `${SITE_ORIGIN}/#/changes` : `${SITE_ORIGIN}/#${pathname}${fullParams.size ? `?${fullParams}` : ""}`;
  return (
    <div data-embed className="bg-paper text-ink">
      <main id="main" className="w-full px-3 md:px-4 py-4">
        {pathname === "/results-2026" && <RotatingPromo messages={CHANGES_MESSAGES} callToAction="כנסו וגלו את הסיפור מאחורי המנדטים!" label="מה השתנה מבחירות קודמות? כנסו וגלו את הסיפור מאחורי המנדטים!" href={`${SITE_ORIGIN}/#/changes`} />}
        {children}
        <div className="mt-5">
          {shareable && <RotatingPromo messages={FLOW_SHARE_MESSAGES} callToAction={FLOW_SHARE_CTA} label="יצירת תמונה או פוסט מותאם אישית — לחצו וצרו פוסט מעוצב בדיוק על מה שמעניין אתכם!" onClick={() => setSharing(true)} />}
          {/* במקום שורת המקור (הכרעת בעלים 30.10.2026): כפתור מעוצב כמו כפתור יצירת הפוסט */}
          <div className="embed-cta relative w-full">
            <div className="embed-cta-action relative flex items-center justify-center w-full min-h-[36px] rounded-theme border border-signal/40 bg-accent-soft px-3 py-0.5 text-accent text-sm md:text-base font-bold leading-snug hover:brightness-95">
              <a href={full} target="_blank" rel="noopener" className="after:absolute after:inset-0 after:content-['']">לפירוט מורחב, כנסו לאתר</a>
            </div>
          </div>
        </div>
        <ScreenFooter info={false}><EmbedButton /></ScreenFooter>
        {sharing && <Suspense fallback={null}><FlowShare onClose={() => setSharing(false)} /></Suspense>}
      </main>
    </div>
  );
}

/** כפתור "הטמעה באתר אחר" — רק במסכים שמותר להטמיע */
export function EmbedButton() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const targets = embedTargetsFor(pathname, params.get("tab"));
  const [pick, setPick] = useState(0);
  const target = targets[pick] ?? targets[0];
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
        {targets.length > 1 && <>
          <p className="mt-2 font-bold">מה להטמיע?</p>
          <Segmented value={String(pick)} onChange={(v) => { setPick(Number(v)); setCopied(false); }} label="מה להטמיע" className="mt-1 w-fit" options={targets.map((t, i) => ({ id: String(i), label: t.short ?? t.name }))} />
          {pick > 0 && <p className="mt-1 text-ink-soft">הגרפים של מעבר בין מפלגות ומעבר בין גושים, עם השורה המפרטת מתחת לכל גרף. {pick === 1 ? "מתג בתוך ההטמעה מחליף ביניהם." : "שני הגרפים זה אחרי זה."}</p>}
        </>}
        <Segmented value={theme} onChange={(value) => { setTheme(value); setCopied(false); }} label="תצוגת ההטמעה" className="mt-2 w-fit" options={[
          { id: "light", label: "בהיר" },
          { id: "auto", label: "לפי העדפת המשתמש" },
        ]} />
        <p className="mt-2 text-ink-soft">לפי העדפת המשתמש: הבחירה השמורה באתר, ואם אין — לפי הגדרת המכשיר.</p>
        <textarea readOnly dir="ltr" value={code} rows={5} className="mt-2 w-full font-mono text-xs bg-paper-card border border-frame rounded p-2" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="mt-2 px-3 py-1.5 rounded border border-frame bg-paper-card" onClick={() => {
          pingEmbed(target.screen, "copy");
          void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {});
        }}>{copied ? "הועתק" : "העתקת הקוד"}</button>
      </div>}
    </>
  );
}
