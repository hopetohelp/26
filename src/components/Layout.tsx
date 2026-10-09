import { PersonalBlocsProvider } from "./PersonalBlocs";
import { pingVisit } from "../lib/visits";
import PageErrorBoundary from "./PageErrorBoundary";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import AccessCard from "./AccessCard";
import { meta } from "../lib/data";
import { dateLong } from "../lib/format";
import { THEMES, useMode, useTheme, type ModeId, type ThemeId } from "../lib/theme";
import { PAGES } from "../lib/pages";
import { useSupportUnread } from "../lib/supportUnread";

const NAV = [{ to: "/", label: "בית" }, ...PAGES.map(({ to, label, short }) => ({ to, label: short ?? label })), { to: "/support", label: "אזור אישי" }];
/** הלשוניות בתחתית המסך בטלפון (הכרעת בעלים 9.10.2026): בית · הכנסת שלי · עוד · סקר האתר · אישי. "עוד" באמצע פותחת חלון עם כל המסכים שאינם בסרגל. */
const TABS = [
  { to: "/", label: "בית", icon: "home" },
  { to: "/guess", label: "הכנסת שלי", icon: "guess" },
  { to: "more", label: "עוד", icon: "more" },
  { to: "/community", label: "סקר האתר", icon: "bars" },
  { to: "/support", label: "אישי", icon: "user" },
];
/** המסכים שאינם בסרגל — נגזר מ-PAGES, כדי שמסך חדש לא יישכח */
const MORE = PAGES.filter((p) => !TABS.some((t) => t.to === p.to));

function daysLeft(now = new Date()): string {
  const d = Math.ceil((Date.parse(meta.electionDay + "T00:00:00+03:00") - now.getTime()) / 86_400_000);
  if (d > 1) return `עוד ${d} ימים`;
  if (d === 1) return "מחר בחירות";
  if (d === 0) return "היום בחירות";
  return "הבחירות התקיימו";
}

function Icon({ name }: { name: string }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "home") return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
  if (name === "board") return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>;
  if (name === "bars") return <svg {...p}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>;
  if (name === "guess") return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h6M7 16h8" /></svg>;
  if (name === "comments") return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M7 8h10M7 12h7" /></svg>;
  if (name === "user") return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
  if (name === "wave") return <svg {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
  return <svg {...p}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

/** בחירת העיצוב: שלוש אפשרויות שוות, כל אחת עם דוגמית הצבע שלה */
export function ThemePicker() {
  return (
    <div className="flex items-center gap-x-3 gap-y-1.5">
      <div className="hidden lg:block">
        <StylePicker />
      </div>
      <StyleToggle />
      <ModePicker />
    </div>
  );
}

/** בטלפון ובטאבלט (אין מקום לשני כפתורים): כפתור אחד שמחליף לעיצוב השני */
function StyleToggle() {
  const [theme, setTheme] = useTheme();
  const cur = THEMES.find((t) => t.id === theme)!;
  const next = THEMES.find((t) => t.id !== theme)!;
  return (
    <button
      type="button"
      onClick={() => setTheme(next.id as ThemeId)}
      aria-label={`עיצוב: ${cur.name}. בלחיצה: ${next.name}`}
      className="lg:hidden flex items-center gap-1.5 rounded-full px-3 h-[44px] text-sm font-bold border border-current opacity-80 hover:opacity-100 whitespace-nowrap"
    >
      <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full border border-black/30" style={{ background: cur.color }} />
      {cur.name}
    </button>
  );
}

/** תאריך הבחירות בשורה הקטנה: מלא כשיש מקום, מקוצר (27/10/26) בטלפון. "הבחירות" מבדיל את התאריך מהספירה לנעילת ההשערות במסך "הכנסת שלי" (9.10.2026); בטלפון המילה לקורא מסך בלבד, כדי שהשורה תיכנס. */
function ElectionDate() {
  const [y, m, d] = meta.electionDay.split("-");
  return (
    <span className="whitespace-nowrap">
      <span className="sr-only sm:not-sr-only">הבחירות </span>
      <span className="hidden sm:inline">{dateLong(meta.electionDay)}</span>
      <span className="sm:hidden" dir="ltr">{`${Number(d)}/${Number(m)}/${y.slice(2)}`}</span>
    </span>
  );
}

/** כפתור תצורה אחד שמתחלף בלחיצה: לפי המכשיר ⇐ יום ⇐ לילה ⇐ לפי המכשיר */
const NEXT_MODE: Record<ModeId, ModeId> = { auto: "light", light: "dark", dark: "auto" };
const MODE_ICON: Record<ModeId, JSX.Element> = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  auto: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </>
  ),
};
const MODE_NAME: Record<ModeId, string> = { light: "יום", dark: "לילה", auto: "לפי המכשיר" };

function ModePicker() {
  const [mode, setMode] = useMode();
  const next = NEXT_MODE[mode];
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`תצורה: ${MODE_NAME[mode]}. בלחיצה: ${MODE_NAME[next]}`}
      title={`תצורה: ${MODE_NAME[mode]}`}
      className="flex items-center justify-center rounded-full w-[44px] h-[44px] lg:w-[36px] lg:h-[36px] border border-current opacity-80 hover:opacity-100"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {MODE_ICON[mode]}
      </svg>
    </button>
  );
}

function StylePicker() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="עיצוב האתר" className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm opacity-80 me-1">עיצוב:</span>
      {THEMES.map((t) => {
        const on = t.id === theme;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(t.id as ThemeId)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 min-h-[44px] lg:min-h-[36px] text-sm font-bold border ${
              on ? "bg-signal text-signal-ink border-signal" : "border-current bg-transparent opacity-80 hover:opacity-100"
            }`}
          >
            <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full border border-black/30" style={{ background: t.color }} />
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * פס עליון אחד, אותו מבנה בשני העיצובים (הכרעת בעלים 9.10.2026, החלטה 2); ההבדל רק בטוקנים (`frame`, `signal`, גופן, רדיוס).
 * בטלפון שורה אחת: שם האתר, מתחתיו "עוד N ימים · תאריך הבחירות", ובצד הבוררים. במחשב הספירה כשבב במרכז.
 */
function Masthead() {
  const left = daysLeft();
  return (
    <div className="bg-frame text-frame-ink border-b border-frame-line md:border-b-0">
      <div className="w-full mx-auto px-4 md:px-6 py-1.5 md:py-3 flex items-center justify-between gap-x-4">
        <div className="min-w-0 md:flex md:items-baseline md:gap-3 text-frame-soft">
          <NavLink to="/" className="block font-display leading-none no-underline text-frame-ink hover:text-frame-ink text-[28px] md:text-[32px] whitespace-nowrap">
            בחירות 26
          </NavLink>
          <p className="mt-1 md:mt-0 text-xs md:text-sm whitespace-nowrap">
            <span className="md:hidden font-bold text-frame-ink">{left}</span>
            <span className="md:hidden" aria-hidden="true"> · </span>
            <ElectionDate />
          </p>
        </div>
        <span className="hidden md:block text-sm font-extrabold border border-frame-ink/40 rounded-full px-3 py-1 whitespace-nowrap">{left}</span>
        <ThemePicker />
      </div>
    </div>
  );
}

function DesktopNav({ unread }: { unread: boolean }) {
  return (
    <nav aria-label="ניווט ראשי" className="hidden md:block bg-frame border-b border-frame-line">
      <ul className="w-full mx-auto px-2 md:px-4 flex flex-wrap gap-1 text-sm">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `inline-block px-2 lg:px-3 py-2.5 no-underline border-b-[3px] ${isActive ? "border-signal text-frame-ink font-bold" : "border-transparent text-frame-soft hover:text-frame-ink"}`
              }
            >
              {n.label}
              {n.to === "/support" && unread && <UnreadDot />}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** סימון "לא נקרא" — נקודה בצבע ההדגשה, עם טקסט לקורא מסך */
function UnreadDot() {
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-signal ms-1 align-top" role="img" aria-label="הודעה חדשה" />;
}

function MobileTabs({ unread }: { unread: boolean }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const inMore = MORE.some((p) => pathname === p.to || pathname.startsWith(`${p.to}/`));
  const close = () => { setOpen(false); moreBtn.current?.focus(); };
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); moreBtn.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const tabClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 h-16 w-full text-xs no-underline ${active ? "text-ink font-bold" : "text-ink-faint"}`;
  return (
    <>
      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/45" onClick={close} aria-hidden="true" />}
      {open && (
        <div
          id="more-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="more-title"
          className="md:hidden fixed inset-x-0 z-40 bg-paper-card text-ink rounded-t-theme border-t border-paper-line px-4 pb-2 bottom-[calc(4rem+env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center justify-between min-h-[52px]">
            <h2 id="more-title" className="text-xl font-extrabold">עוד</h2>
            <button ref={closeBtn} type="button" onClick={close} aria-label="סגירה" className="w-11 h-11 grid place-items-center rounded-full border border-paper-line">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <ul>
            {MORE.map((p) => (
              <li key={p.to}>
                <Link to={p.to} className="flex items-center min-h-[56px] border-t border-paper-line font-semibold no-underline text-ink hover:text-ink">{p.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <nav aria-label="ניווט בטלפון" className={`md:hidden fixed bottom-0 inset-x-0 ${open ? "z-50" : "z-30"} bg-paper-card border-t border-paper-line pb-[env(safe-area-inset-bottom)]`}>
        <ul className="grid grid-cols-5">
          {TABS.map((t) => (
            <li key={t.to}>
              {t.to === "more" ? (
                <button
                  ref={moreBtn}
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  aria-controls="more-sheet"
                  onClick={() => setOpen((v) => !v)}
                  className={tabClass(open || inMore)}
                  aria-current={inMore && !open ? "page" : undefined}
                >
                  <span className="relative"><Icon name={t.icon} /></span>
                  {t.label}
                </button>
              ) : (
                <NavLink to={t.to} end={t.to === "/"} className={({ isActive }) => tabClass(isActive && !open)}>
                  <span className="relative"><Icon name={t.icon} />{t.to === "/support" && unread && <span className="absolute -top-0.5 -end-1"><UnreadDot /></span>}</span>
                  {t.label}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** במחשב: הזמנה צפה להשערה (הכרעת בעלים 8.10.2026). לא במסכי ההשערה והסטטיסטיקות ולא בניהול; לתוכן יש ריווח תחתון כדי שלא יוסתר. */
const NO_GUESS_CTA = ["/guess", "/community", "/admin"];
function GuessCta({ pathname }: { pathname: string }) {
  // בית: ההזמנה כבר בפאנל עצמו (הכרעת בעלים 8.10.2026)
  if (pathname === "/" || NO_GUESS_CTA.some((p) => pathname.startsWith(p))) return null;
  return (
    <Link
      to="/guess"
      className="hidden md:flex fixed bottom-6 end-6 z-30 items-center min-h-[48px] px-5 rounded-full bg-signal text-signal-ink font-bold shadow-lg no-underline hover:brightness-95"
    >
      לבנות את הכנסת שלי
    </Link>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const unread = useSupportUnread(pathname);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
    // מונה כניסות (src/lib/visits.ts)
    pingVisit(pathname);
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 bg-ink text-paper-card px-3 py-2 rounded z-50">
        דילוג לתוכן
      </a>
      {/* במחשב הסרגל העליון תמיד גלוי (הכרעת בעלים 8.10.2026) */}
      <header className="md:sticky md:top-0 md:z-40">
        <Masthead />
        <DesktopNav unread={unread} />
      </header>
      <AccessCard />
      <main id="main" tabIndex={-1} className="flex-1 w-full mx-auto px-4 md:px-6 py-6 pb-28 md:pb-24 outline-none">
        <PersonalBlocsProvider><PageErrorBoundary><Outlet /></PageErrorBoundary></PersonalBlocsProvider>
      </main>
      <MobileTabs unread={unread} />
      <GuessCta pathname={pathname} />
    </div>
  );
}
