import { InterfaceProvider, useInterface } from "../lib/interfaceMode";
import { PersonalBlocsProvider } from "./PersonalBlocs";
import { pingVisit } from "../lib/visits";
import PageErrorBoundary from "./PageErrorBoundary";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ScreenLegend } from "./ChartLegend";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import AccessCard from "./AccessCard";
import PrivacyCard from "./PrivacyConsent";
import { useMode, type ModeId } from "../lib/theme";
import { navScreens, type Screen } from "../lib/pages";
import { useSupportUnread } from "../lib/supportUnread";
import { clockParts } from "./ExitPollClock";
import { wallClockLeft } from "../lib/countdown";
import { LOCK_AT } from "../pages/guess/model";
import { useSession } from "../pages/guess/useCrowd";
import { call } from "../lib/crowdApi";
import { getPicture } from "../lib/crowdSession";
import { useHagzaraTheme } from "../pages/simple/hagzara";

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
 * המעטפת היחידה (הכרעות בעלים 23.10.2026; תוכנית מאוחדת, פרק ב): פס דק — שם האתר (וסמל הגזרה לחבריה), שעון העצר ומתג "מתקדם".
 * המתג מוסיף פקדים ופירוט באותו מסך; אינו מחליף מעטפת.
 * שם המסך נקרא מסרגל הניווט הצף: במחשב בפס העליון, בטלפון צף למטה.
 */
function FocusBar({ member, navTop, onFit }: { member: boolean; navTop: boolean; onFit: (top: boolean) => void }) {
  // חברי הגזרה: בטלפון השם בכותרת; הסמל במסך עצמו, מעל גרף הגושים (הכרעת בעלים 23.10.2026)
  const bar = useRef<HTMLDivElement>(null), navW = useRef(0);
  // הסרגל עולה לפס העליון רק כשיש לו מקום באמת (לפי מדידה, לא לפי רוחב קבוע) — בטאבלט לאורך הוא יורד למטה.
  // מחליטים רק כשרוחב המסך משתנה (לא כשהשעון או הגופן משנים את התוכן), ועם מרווח ביטחון — כדי שלא יהבהב בין למעלה ולמטה
  const lastW = useRef(-1);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    // downOnly: שינוי בתוכן הפס (שם הגזרה, כפתור, גופן) — רק מוריד את הסרגל כשאין לו מקום, אף פעם לא מעלה, כדי שלא יהבהב
    const decide = (force = false, downOnly = false) => {
      const w = el.clientWidth;
      if (!force && !downOnly && w === lastW.current) return;
      lastW.current = w;
      const top = el.querySelector<HTMLElement>(".f-nav-top"), bottom = document.querySelector<HTMLElement>(".f-nav-bottom");
      // הסרגל התחתון נמתח לכל רוחב המסך; לכן נמדד רוחבו הטבעי (בלי מתיחה) ולא הרוחב שהוא תופס
      const natural = (nav: HTMLElement | null) => { if (!nav) return 0; nav.classList.add("f-nav-measure"); const w = nav.offsetWidth; nav.classList.remove("f-nav-measure"); return w; };
      navW.current = Math.max(navW.current, natural(top), natural(bottom));
      // רוחב שאר הפס בלי הסרגל: אם הסרגל למעלה — מורידים את רוחבו ואת הרווח
      const others = el.scrollWidth - (el.querySelector<HTMLElement>(".flex-1")?.offsetWidth ?? 0) - (top ? top.offsetWidth + 8 : 0);
      const gap = el.querySelector<HTMLElement>(".flex-1")?.offsetWidth ?? 0;
      // הסרגל כבר למעלה אבל הפס צפוף (הרווח נעלם או התוכן גולש) ⇐ אין מקום, גם אם החישוב אומר אחרת
      const crowded = !!top && (gap < 24 || el.scrollWidth > el.clientWidth + 1);
      const fits = !crowded && (navW.current > 0 ? w - others >= navW.current + 40 : w >= 1100);
      if (downOnly && fits) return;
      if (fits !== !!top) onFit(fits);
    };
    decide(true);
    document.fonts?.ready.then(() => decide(true));
    const ro = new ResizeObserver(() => decide());
    ro.observe(el);
    // גם כשהתוכן שליד הסרגל גדל (למשל "הגזרה ·" אחרי טעינת החברות) — בודקים שוב אם עדיין יש מקום
    const content = new ResizeObserver(() => decide(false, true));
    // כולל הסרגל עצמו: אחרי הכניסה נוספים לו כפתורים (ניהול קבוצה, ניהול האתר) והוא מתרחב
    for (const c of Array.from(el.children)) if (!c.classList.contains("flex-1")) content.observe(c);
    return () => { ro.disconnect(); content.disconnect(); };
  }, [onFit, member, navTop]);
  return <div ref={bar} className={`f-bar${member ? " member" : ""}`}>
    <NavLink to="/" className="f-logo">{member && <span className="f-gname">הגזרה ·</span>}בחירות 26</NavLink>
    <FocusClock />
    {navTop ? <FocusNav className="f-nav-top" unread={false} /> : <span className="flex-1" />}
    <AdvancedSwitch />
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
  const { advanced } = useInterface();
  const groupTab = useGroupTab();
  // שלושת מסכי הליבה תמיד; במתקדם — "עוד" (קטלוג הניווט, src/lib/pages.ts)
  const screens = navScreens(advanced), core = screens.filter(s => s.nav === "core"), more = screens.filter(s => s.nav === "more");
  // סבב 9 (הכרעת בעלים 24.10.2026): מימין פרופיל ⇐ האזור האישי, משמאל "AI" ⇐ מסך ה-AI עם נקודה לתשובה חדשה
  // קישור הגזרה (#/g/hagzara) פותח את הכנסת הממוצעת — מסומן כך בסרגל
  return <nav aria-label="ניווט ראשי" className={`f-nav ${className}`}>
    <NavLink to="/account" className="f-me" aria-label="אזור אישי"><ProfileFace /></NavLink>
    {core.map(t => <NavLink key={t.to} to={t.to} end={t.to === "/"} aria-current={t.to === "/community" && pathname.startsWith("/g/") ? "page" : undefined}>{t.label}</NavLink>)}
    {more.length > 0 && <MoreMenu screens={more} up={className === "f-nav-bottom"} />}
    {groupTab.map(t => <NavLink key={t.to} to={t.to} className="f-grp" aria-label={t.label} title={t.label}><Icon name={t.icon} /><span className="t">{t.short}</span></NavLink>)}
    <NavLink to="/ai" className="f-ai" aria-label={unread ? "AI — תשובה חדשה" : "AI"}>AI{unread && <span className="f-dot" aria-hidden="true" />}</NavLink>
  </nav>;
}
/** מתג "מתקדם" (תוכנית מאוחדת, פרק ב): אינו משנה כתובת, טיוטה או מקור; ההעדפה לביקור הנוכחי (sessionStorage) */
function AdvancedSwitch() {
  const { advanced, toggle } = useInterface();
  return <button type="button" role="switch" aria-checked={advanced} onClick={toggle} className="f-switch"><span className="f-switch-track" aria-hidden="true"><span /></span>מתקדם</button>;
}
/** "עוד" בסרגל — המסכים הנוספים של המתקדם. נסגר בבחירה, בלחיצה בחוץ וב-Escape */
function MoreMenu({ screens, up }: { screens: Screen[]; up: boolean }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const here = screens.some(s => pathname.startsWith(s.to));
  return <div ref={box} className={`f-more${up ? " up" : ""}`}>
    <button type="button" aria-expanded={open} aria-haspopup="true" className={here ? "on" : undefined} onClick={() => setOpen(v => !v)}>עוד</button>
    {open && <ul>{screens.map(s => <li key={s.to}><NavLink to={s.to}>{s.label}</NavLink></li>)}</ul>}
  </div>;
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

/** כמה פיקסלים מתחתית המסך מכוסים בסרגלים צפים (ניווט תחתון, פס הגושים). נמדד בפועל, כדי שבכל מסך ובכל מכשיר יהיה מרווח שהסרגל לא יסתיר תוכן */
const BOTTOM_BARS = ".f-nav-bottom, .f-dock";
function useBottomCover(): number {
  const [cover, setCover] = useState(0);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // גובה פס הגושים הצף — הסרגל יושב צמוד מעליו (הכרעת בעלים 25.10.2026)
        const dock = document.querySelector<HTMLElement>(".f-dock.floating");
        const dh = dock && getComputedStyle(dock).position === "fixed" ? Math.round(dock.getBoundingClientRect().height) : 0;
        if (dh) document.documentElement.style.setProperty("--dock-h", `${dh}px`);
        let top = window.innerHeight;
        document.querySelectorAll<HTMLElement>(BOTTOM_BARS).forEach((el) => {
          if (getComputedStyle(el).position !== "fixed") return;
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.top > window.innerHeight / 2) top = Math.min(top, r.top);
        });
        setCover(Math.max(0, Math.round(window.innerHeight - top)));
      });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); mo.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return cover;
}

export default function Layout() {
  return <InterfaceProvider><LayoutBody /></InterfaceProvider>;
}
/**
 * חשבון עם מייל שעוד לא אומת: בכל טעינה של האתר בודקים בשקט פעם אחת אם המייל כבר אומת (הכרעת בעלים 25.10.2026) —
 * מי שלחץ על הקישור במייל מסומן מאומת בלי לחפש את הכפתור "בדקתי". השרת מגביל ל-30 בדיקות בשעה לחשבון.
 */
function useVerifyOnLoad() {
  const session = useSession();
  const pending = !!session.token && !!session.me?.emails?.some((e) => e.email && !e.verified);
  const done = useRef(false);
  useEffect(() => {
    if (!pending || done.current) return;
    done.current = true;
    void call<{ verified: boolean }>("/account/verify/check", { token: session.token, body: {} })
      .then((r) => { if (r.verified) void session.refresh(); }, () => { /* לא נשלח מייל עדיין, או אין חיבור — שקט */ });
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps
}

function LayoutBody() {
  const bottomCover = useBottomCover();
  const [navTop, setNavTop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1100);
  useVerifyOnLoad();
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
      <header className="sticky top-0 z-40"><FocusBar member={hagzara} navTop={navTop} onFit={setNavTop} /></header>
      <AccessCard />
      <PrivacyCard />
      <main id="main" data-screen={pathname.split("/")[1] || "home"} tabIndex={-1} style={pathname === "/ai" || !bottomCover ? undefined : { paddingBottom: Math.max(bottomCover + 32, 96) }} className={`flex-1 w-full mx-auto px-4 md:px-6 py-6 outline-none ${pathname === "/ai" ? "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0" : "pb-28 md:pb-24"}`}>
        <PersonalBlocsProvider><PageErrorBoundary><ScreenLegend><Suspense fallback={<p className="text-ink-soft">טוען…</p>}><Outlet /></Suspense></ScreenLegend></PageErrorBoundary></PersonalBlocsProvider>
      </main>
      {!navTop && <FocusNav className="f-nav-bottom" unread={unread} />}
    </div>
  );
}
