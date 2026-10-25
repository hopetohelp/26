import { InterfaceProvider, useInterface } from "../lib/interfaceMode";
import { PersonalBlocsProvider } from "./PersonalBlocs";
import { pingVisit } from "../lib/visits";
import PageErrorBoundary from "./PageErrorBoundary";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ScreenLegend } from "./ChartLegend";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import AccessCard from "./AccessCard";
import PrivacyCard from "./PrivacyConsent";
import { meta } from "../lib/data";
import { date } from "../lib/format";
import { useMode, type ModeId } from "../lib/theme";
import { PAGES } from "../lib/pages";
import { useSupportUnread } from "../lib/supportUnread";
import ExitPollClock, { clockParts } from "./ExitPollClock";
import { wallClockLeft } from "../lib/countdown";
import { LOCK_AT } from "../pages/guess/model";
import { MASTHEAD_SLOT } from "./SourcePicker";
import { useSession } from "../pages/guess/useCrowd";
import { getPicture } from "../lib/crowdSession";
import { useHagzaraTheme } from "../pages/simple/hagzara";

const SIMPLE_TABS = [{ to: "/", label: "תמונת מצב", icon: "home" }, { to: "/guess", label: "הניחוש שלי", icon: "guess" }, { to: "/community", label: "ממוצע הניחושים", icon: "bars" }];
const NAV = [{ to: "/", label: "בית" }, ...PAGES.map(({ to, label, short }) => ({ to, label: short ?? label })), { to: "/ai", label: "AI" }, { to: "/account", label: "אזור אישי" }];
/** שש לשוניות; ברוחב צר הסרגל נגלל עם חץ לצד. */
const TABS = [
  { to: "/", label: "בית", icon: "home" },
  { to: "/guess", label: "הניחוש שלי", icon: "guess" },
  { to: "/polls", label: "סקרים", icon: "bars" },
  { to: "/past", label: "בחירות קודמות", icon: "board" },
  { to: "/method", label: "מידע", icon: "info" },
  { to: "/ai", label: "AI", icon: "comments" },
  { to: "/account", label: "אישי", icon: "user" },
];
/** לשונית "ניהול קבוצה" — רק למי שמנהל קבוצה (מייל מאומת ברשימת המנהלים) */
const GROUP_TAB = { to: "/group-admin", label: "ניהול קבוצה", short: "קבוצה", icon: "group" };
function useGroupTab() {
  const { me, token } = useSession();
  return token && (me?.managedGroups?.length ?? 0) > 0 ? [GROUP_TAB] : [];
}

function Icon({ name }: { name: string }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "home") return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
  if (name === "info") return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.1" /></svg>;
  if (name === "board") return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>;
  if (name === "bars") return <svg {...p}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>;
  if (name === "guess") return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h6M7 16h8" /></svg>;
  if (name === "comments") return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M7 8h10M7 12h7" /></svg>;
  if (name === "user") return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
  if (name === "group") return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2.4.6 4 2.4 4 5.2" /></svg>;
  if (name === "wave") return <svg {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
  return <svg {...p}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

/** תאריך הבחירות בשורה הקטנה: תמיד בתבנית היום/חודש (27/10), כמו כל תאריך באתר. "הבחירות" מבדיל את התאריך מהספירה לנעילת ההשערות במסך "הכנסת שלי" (9.10.2026); בטלפון המילה לקורא מסך בלבד, כדי שהשורה תיכנס. */
function ElectionDate() {
  return (
    <span className="whitespace-nowrap">
      <span className="sr-only sm:not-sr-only">הבחירות </span>
      <span dir="ltr">{date(meta.electionDay)}</span>
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

/**
 * פס עליון אחד (הכרעת בעלים 9.10.2026, החלטה 2), בטוקנים (`frame`, `signal`, גופן, רדיוס).
 * שורה אחת בכל רוחב: שם האתר ומתחתיו תאריך הבחירות (מימין), שעון העצר עד המדגמים במרכז (הכרעת בעלים 12.10.2026, במקום "עוד N ימים"), בורר הממוצע של המסך הפתוח (18.10.2026) ובורר התצורה.
 */
function Masthead() {
  const { advanced, toggle } = useInterface();
  return (
    <div className="bg-frame text-frame-ink border-b border-frame-line md:border-b-0">
      {/* בטלפון בשורה נפרדת; כשיש מקום — באותה שורה של הכותרת */}
      {advanced && <div className="flex md:hidden justify-end px-4 pt-1"><button type="button" onClick={toggle} className="shrink-0 min-h-[44px] rounded-full border border-frame-line px-3 text-sm font-bold">לתצוגה הממוקדת</button></div>}
      <div className="c-masthead-row w-full mx-auto px-4 md:px-6 py-1.5 md:py-3 flex items-center justify-between gap-x-2 md:gap-x-4">
        <div className="min-w-0 md:flex md:items-baseline md:gap-3 text-frame-soft">
          <NavLink to="/" className="block font-display leading-none no-underline text-frame-ink hover:text-frame-ink text-[28px] md:text-[32px] whitespace-nowrap">
            בחירות 26
          </NavLink>
          <p className="mt-1 md:mt-0 text-xs md:text-sm whitespace-nowrap">
            <ElectionDate />
          </p>
        </div>
        <ExitPollClock bar />
        {/* בורר הממוצע של המסך הפתוח (SourcePicker נכנס לכאן); ריק במסכים בלי בחירת מקור */}
        <div id={MASTHEAD_SLOT} className="c-masthead-source empty:hidden" />
        {advanced && <button type="button" onClick={toggle} className="hidden md:inline-flex items-center shrink-0 min-h-[40px] rounded-full border border-frame-line px-3 text-sm font-bold whitespace-nowrap">לתצוגה הממוקדת</button>}
        <ModePicker />
      </div>
    </div>
  );
}

/**
 * התצוגה הממוקדת (הכרעות בעלים 23.10.2026): פס דק — שם האתר (וסמל הגזרה לחבריה), שעון העצר, "יש שאלה?" ו"למחקר מתקדם".
 * שם המסך נקרא מסרגל הניווט הצף: במחשב בפס העליון, בטלפון צף למטה.
 */
function FocusBar({ member }: { member: boolean }) {
  // חברי הגזרה: בטלפון השם בכותרת; הסמל במסך עצמו, מעל גרף הגושים (הכרעת בעלים 23.10.2026)
  const { toggle } = useInterface();
  return <div className={`f-bar${member ? " member" : ""}`}>
    <NavLink to="/" className="f-logo">{member && <span className="f-gname">הגזרה ·</span>}בחירות 26</NavLink>
    <FocusClock />
    <FocusNav className="f-nav-top" unread={false} />
    <span className="flex-1" />
    <button type="button" onClick={toggle} className="f-btn pri">למחקר מתקדם</button>
    <span className="f-mode"><ModePicker /></span>
  </div>;
}
/** שעון העצר עד המדגמים, קומפקטי: ימים:שעות:דקות */
function FocusClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const p = clockParts(wallClockLeft(LOCK_AT, now));
  const two = (n: number) => String(n).padStart(2, "0");
  if (!p) return <span className="f-clock">המדגמים פורסמו</span>;
  return <span className="f-clock" role="timer" aria-label={`עד המדגמים: ${p.days} ימים, ${p.hours} שעות ו-${p.minutes} דקות`}><span aria-hidden="true">⏱</span><b dir="ltr" aria-hidden="true">{p.days}:{two(p.hours)}:{two(p.minutes)}</b></span>;
}
function FocusNav({ className, unread }: { className: string; unread: boolean }) {
  const { pathname } = useLocation();
  const groupTab = useGroupTab();
  // סבב 9 (הכרעת בעלים 24.10.2026): מימין פרופיל ⇐ האזור האישי, משמאל "AI" ⇐ מסך ה-AI עם נקודה לתשובה חדשה
  // קישור הגזרה (#/g/hagzara) פותח את הכנסת הממוצעת — מסומן כך בסרגל
  return <nav aria-label="ניווט ראשי" className={`f-nav ${className}`}>
    <NavLink to="/account" className="f-me" aria-label="אזור אישי"><ProfileFace /></NavLink>
    {SIMPLE_TABS.map(t => <NavLink key={t.to} to={t.to} end={t.to === "/"} aria-current={t.to === "/community" && pathname.startsWith("/g/") ? "page" : undefined}>{t.label}</NavLink>)}
    {groupTab.map(t => <NavLink key={t.to} to={t.to} className="f-grp" aria-label={t.label} title={t.label}><Icon name={t.icon} /><span className="t">{t.short}</span></NavLink>)}
    <NavLink to="/ai" className="f-ai" aria-label={unread ? "AI — תשובה חדשה" : "AI"}>AI{unread && <span className="f-dot" aria-hidden="true" />}</NavLink>
  </nav>;
}
/** תמונת Google של המחובר, ואם אין — האות הראשונה של השם, ואם אין — סמל אדם */
function ProfileFace() {
  const { me, token } = useSession();
  const [broken, setBroken] = useState(false);
  const pic = token ? getPicture() : null;
  if (pic && !broken) return <img src={pic} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  const letter = (me?.name ?? "").trim().charAt(0);
  return <span aria-hidden="true">{letter || <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>}</span>;
}

function DesktopNav({ unread }: { unread: boolean }) {
  const { advanced } = useInterface();
  const groupTab = useGroupTab();
  return (
    <nav aria-label="ניווט ראשי" className="hidden md:block bg-frame border-b border-frame-line">
      <ul className="w-full mx-auto px-2 md:px-4 flex flex-wrap gap-1 text-sm">
        {[...(advanced ? NAV : SIMPLE_TABS), ...groupTab].map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `inline-block px-2 lg:px-3 py-2.5 no-underline border-b-[3px] ${isActive ? "border-signal text-frame-ink font-bold" : "border-transparent text-frame-soft hover:text-frame-ink"}`
              }
            >
              {n.label}
              {n.to === "/ai" && unread && <UnreadDot />}
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
  const { advanced } = useInterface();
  const groupTab = useGroupTab();
  const { pathname } = useLocation();
  const scroller = useRef<HTMLUListElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => { const required = Array.from(el.children).reduce((sum, child) => sum + (child as HTMLElement).offsetWidth, 0); setOverflow(required > (el.parentElement?.clientWidth ?? 0) + 1); setAtEnd(Math.abs(el.scrollLeft) >= el.scrollWidth - el.clientWidth - 2); };
    const observer = new ResizeObserver(update); observer.observe(el);
    el.addEventListener("scroll", update); document.fonts.ready.then(update); update();
    return () => { observer.disconnect(); el.removeEventListener("scroll", update); };
  }, [advanced]);
  useEffect(() => { scroller.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [pathname]);
  return <nav aria-label="ניווט בטלפון" className="c-mobile-tabs md:hidden fixed bottom-0 inset-x-0 z-30 bg-paper-card border-t border-paper-line pb-[env(safe-area-inset-bottom)]">
    <ul ref={scroller} className="c-mobile-tab-list">{[...(advanced ? TABS : SIMPLE_TABS), ...groupTab.map((t) => ({ ...t, label: t.short }))].map(t => <li key={t.to}><NavLink to={t.to} end={t.to === "/"} className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 h-16 text-xs no-underline ${isActive ? "text-ink font-bold" : "text-ink-faint"}`}><span className="relative"><Icon name={t.icon} />{t.to === "/ai" && unread && <span className="absolute -top-0.5 -end-1"><UnreadDot /></span>}</span><span>{t.label}</span></NavLink></li>)}</ul>
    {overflow && <button type="button" className="c-tab-scroll" aria-label={atEnd ? "גלילה לתחילת הניווט" : "גלילה להמשך הניווט"} onClick={() => scroller.current?.scrollBy({ left: (atEnd ? 1 : -1) * scroller.current.clientWidth * .7, behavior: "smooth" })}>{atEnd ? "→" : "←"}</button>}
  </nav>;
}

const NO_GUESS_CTA = ["/guess", "/community", "/admin", "/ai", "/account", "/group-admin"];
function GuessCta({ pathname }: { pathname: string }) {
  // בית: ההזמנה כבר בפאנל עצמו (הכרעת בעלים 8.10.2026)
  if (pathname === "/" || NO_GUESS_CTA.some((p) => pathname.startsWith(p))) return null;
  return (
    <Link
      to="/guess"
      className="hidden md:flex fixed bottom-6 end-6 z-30 items-center min-h-[48px] px-5 rounded-full bg-signal text-signal-ink font-bold shadow-lg no-underline hover:brightness-95"
    >
      לבנות את הניחוש שלי
    </Link>
  );
}

export default function Layout() {
  return <InterfaceProvider><LayoutBody /></InterfaceProvider>;
}
function LayoutBody() {
  const { advanced } = useInterface();
  const { pathname, hash } = useLocation();
  const unread = useSupportUnread(pathname);
  const session = useSession();
  const hagzara = useHagzaraTheme(session);
  useEffect(() => {
    // קישור לעוגן (למשל /method#model מהעוזר או מ"איך זה חושב?") — המסך מגלל לערך בעצמו; לא מחזירים לראש העמוד
    if (!hash) window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
    // מונה כניסות (src/lib/visits.ts)
    pingVisit(pathname);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-interface={advanced ? "advanced" : "simple"} className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 bg-ink text-paper-card px-3 py-2 rounded z-50">
        דילוג לתוכן
      </a>
      {/* במחשב הסרגל העליון תמיד גלוי (הכרעת בעלים 8.10.2026) */}
      {advanced ? <header className="md:sticky md:top-0 md:z-40">
        <Masthead />
        <DesktopNav unread={unread} />
      </header> : <header className="sticky top-0 z-40"><FocusBar member={hagzara} /></header>}
      <AccessCard />
      <PrivacyCard />
      <main id="main" data-screen={pathname.split("/")[1] || "home"} tabIndex={-1} className={`flex-1 w-full mx-auto px-4 md:px-6 py-6 outline-none ${pathname === "/ai" ? "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0" : "pb-28 md:pb-24"}`}>
        <PersonalBlocsProvider><PageErrorBoundary><ScreenLegend><Suspense fallback={<p className="text-ink-soft">טוען…</p>}><Outlet /></Suspense></ScreenLegend></PageErrorBoundary></PersonalBlocsProvider>
      </main>
      {advanced ? <MobileTabs unread={unread} /> : <FocusNav className="f-nav-bottom" unread={unread} />}
      {advanced && <GuessCta pathname={pathname} />}
    </div>
  );
}
