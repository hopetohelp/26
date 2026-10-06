import { FEEDBACK_URL } from "../lib/feedback";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import FreezeBanner from "./FreezeBanner";
import Feedback from "./Feedback";
import { meta } from "../lib/data";
import { dateLong } from "../lib/format";
import { MODES, THEMES, useMode, useTheme, type ModeId, type ThemeId } from "../lib/theme";
import { colorOf } from "../lib/colors";
import modelFile from "../data/model.json";
import { PAGES } from "../lib/pages";

const NAV = [{ to: "/", label: "בית" }, ...PAGES.map(({ to, label }) => ({ to, label }))];
/** הלשוניות בתחתית המסך בטלפון. כל שאר המסכים — מריבועי מסך הבית (בלי "עוד", הכרעת בעלים) */
const TABS = [
  { to: "/", label: "בית", icon: "home" },
  { to: "/today", label: "מצב ותחזית", icon: "board" },
  { to: "/polls", label: "סקרים", icon: "bars" },
];

const central = (modelFile as unknown as { central: { seats: Record<string, number> } }).central.seats;
const strip = Object.entries(central)
  .filter(([, s]) => s > 0)
  .sort((a, b) => b[1] - a[1]);

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
  if (name === "wave") return <svg {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
  return <svg {...p}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

/** בחירת העיצוב: שלוש אפשרויות שוות, כל אחת עם דוגמית הצבע שלה */
export function ThemePicker() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <StylePicker />
      <ModePicker />
    </div>
  );
}

const pill = (on: boolean) =>
  `flex items-center gap-1.5 rounded-full px-2.5 min-h-[44px] md:min-h-[36px] text-sm font-bold border ${
    on ? "bg-signal text-signal-ink border-signal" : "border-current bg-transparent opacity-80 hover:opacity-100"
  }`;

/** בחירת תצורה: בהיר · חשוך · לפי המכשיר */
function ModePicker() {
  const [mode, setMode] = useMode();
  return (
    <div role="radiogroup" aria-label="תצורת צבעים" className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm opacity-80 me-1">תצורה:</span>
      {MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={m.id === mode} onClick={() => setMode(m.id as ModeId)} className={pill(m.id === mode)}>
          {m.name}
        </button>
      ))}
    </div>
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
            className={`flex items-center gap-1.5 rounded-full px-2.5 min-h-[44px] md:min-h-[36px] text-sm font-bold border ${
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

function Masthead({ theme }: { theme: ThemeId }) {
  const left = daysLeft();
  if (theme === "board") {
    return (
      <div className="bg-frame text-frame-ink">
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-3 flex flex-col gap-2.5">
          <div className="flex justify-between items-baseline gap-3">
            <NavLink to="/" className="font-display text-[42px] leading-none no-underline text-frame-ink hover:text-frame-ink">
              בחירות 26
            </NavLink>
            <span className="font-display text-[28px] leading-none text-signal">{left}</span>
          </div>
          <div className="flex h-2.5 gap-px" role="img" aria-label="הרכב 120 המנדטים לפי הממוצע היום">
            {strip.map(([id, s], i) => (
              <span key={id} style={{ flexGrow: s, background: colorOf(id, i) }} />
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 items-center text-xs text-frame-soft">
            <span>הבחירות לכנסת ה-26, {dateLong(meta.electionDay)}</span>
            <ThemePicker />
          </div>
        </div>
      </div>
    );
  }
  if (theme === "league") {
    return (
      <div className="bg-frame text-frame-ink border-b border-frame-line">
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-3 flex flex-col gap-2">
          <div className="flex justify-between items-center gap-3">
            <NavLink to="/" className="font-display text-[32px] leading-none no-underline text-frame-ink hover:text-frame-ink">
              בחירות 26
            </NavLink>
            <span className="text-sm font-extrabold bg-ink text-paper-card rounded-md px-2.5 py-1.5 whitespace-nowrap">{left}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 items-center text-sm text-frame-soft">
            <span>הבחירות לכנסת ה-26, {dateLong(meta.electionDay)}</span>
            <ThemePicker />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="text-ink">
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-2 flex flex-col gap-1">
        <div className="flex justify-between items-start gap-3">
          <NavLink to="/" className="font-display text-[clamp(44px,14vw,60px)] leading-[0.85] no-underline text-ink hover:text-ink whitespace-nowrap min-w-0">
            בחירות 26
          </NavLink>
          <span className="mt-2 text-sm font-extrabold bg-ink text-paper-card px-2.5 py-1.5 whitespace-nowrap">{left}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 items-center text-sm font-semibold text-ink-soft">
          <span>הבחירות לכנסת ה-26, {dateLong(meta.electionDay)}</span>
          <ThemePicker />
        </div>
      </div>
    </div>
  );
}

function DesktopNav({ theme }: { theme: ThemeId }) {
  const wrap = theme === "board" ? "bg-frame" : theme === "league" ? "bg-frame border-b border-frame-line" : "";
  return (
    <nav aria-label="ניווט ראשי" className={`hidden md:block ${wrap}`}>
      <ul className="max-w-6xl mx-auto px-2 flex flex-wrap gap-1 text-sm">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) => {
                if (theme === "board")
                  return `inline-block px-3 py-2.5 no-underline border-b-[3px] ${isActive ? "border-signal text-frame-ink font-bold" : "border-transparent text-frame-soft hover:text-frame-ink"}`;
                if (theme === "league")
                  return `inline-block px-3 py-2.5 no-underline border-b-[3px] ${isActive ? "border-accent text-ink font-bold" : "border-transparent text-ink-soft hover:text-ink"}`;
                return `inline-block px-3 py-1.5 my-1 no-underline font-bold ${isActive ? "bg-ink text-paper-card" : "text-ink hover:bg-ink/10"}`;
              }}
            >
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MobileTabs() {
  return (
    <nav aria-label="ניווט בטלפון" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-paper-card border-t border-paper-line pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-3">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 h-16 text-xs no-underline ${isActive ? "text-ink font-bold" : "text-ink-faint"}`
              }
            >
              <Icon name={t.icon} />
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const [theme] = useTheme();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
    // מונה כניסות: רק שם העמוד, בלי שום מזהה של הגולש
    if (FEEDBACK_URL) fetch(`${FEEDBACK_URL}/hit`, { method: "POST", body: JSON.stringify({ page: pathname }), keepalive: true }).catch(() => {});
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 bg-ink text-paper-card px-3 py-2 rounded z-50">
        דילוג לתוכן
      </a>
      <header>
        <Masthead theme={theme} />
        <DesktopNav theme={theme} />
      </header>
      <FreezeBanner />
      <main id="main" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-28 md:pb-10 outline-none">
        <Outlet />
      </main>
      <footer className="border-t border-paper-line bg-paper-card text-sm text-ink-soft mb-16 md:mb-0">
        <div className="max-w-6xl mx-auto px-4 py-4 space-y-1">
          <p>
            <strong>האתר אינו עורך סקרים.</strong> הממוצעים, הטווחים והתרחישים הם ניתוח של סקרים שכבר פורסמו, עם פרטי כל סקר ומקורו.
            תוצאות האמת — מקובצי ועדת הבחירות המרכזית.
          </p>
          <p>
            הנתונים נכונים ל-{dateLong(meta.dataAsOf)}. <a href="https://github.com/hopetohelp/26">הקוד והנתונים פתוחים</a>.
          </p>
        </div>
      </footer>
      <Feedback />
      <MobileTabs />
    </div>
  );
}
