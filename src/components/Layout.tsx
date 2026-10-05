import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import FreezeBanner from "./FreezeBanner";
import { meta } from "../lib/data";
import { dateLong } from "../lib/format";

const NAV = [
  { to: "/", label: "המצב היום" },
  { to: "/polls", label: "ארכיון הסקרים" },
  { to: "/trends", label: "מגמות" },
  { to: "/calculator", label: "מחשבון מנדטים" },
  { to: "/results", label: "תוצאות אמת" },
  { to: "/accuracy", label: "דיוק הסקרים" },
  { to: "/voters", label: "מצביעים" },
  { to: "/method", label: "שיטה ומקורות" },
  { to: "/about", label: "אודות" },
];

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 bg-ink text-white px-3 py-2 rounded z-50">
        דילוג לתוכן
      </a>
      <header className="bg-white border-b border-paper-line">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <NavLink to="/" className="text-xl font-extrabold text-ink no-underline">
            בחירות 2026 <span className="font-medium text-ink-soft">· ניתוח</span>
          </NavLink>
          <p className="text-sm text-ink-soft">הבחירות לכנסת ה-26 · {dateLong(meta.electionDay)}</p>
        </div>
        <nav aria-label="ניווט ראשי" className="max-w-6xl mx-auto px-2 overflow-x-auto">
          <ul className="flex gap-1 whitespace-nowrap text-sm">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === "/"}
                  className={({ isActive }) =>
                    `inline-block px-3 py-2 rounded-t-md no-underline ${isActive ? "bg-paper text-accent font-bold" : "text-ink-soft hover:text-ink"}`
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <FreezeBanner />
      <main id="main" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 outline-none">
        <Outlet />
      </main>
      <footer className="border-t border-paper-line bg-white text-sm text-ink-soft">
        <div className="max-w-6xl mx-auto px-4 py-4 space-y-1">
          <p>
            <strong>האתר אינו עורך סקרים.</strong> הממוצעים והטווחים הם ניתוח של סקרים שכבר פורסמו, עם פרטי כל סקר ומקורו.
            תוצאות האמת — מקובצי ועדת הבחירות המרכזית.
          </p>
          <p>
            הנתונים נכונים ל-{dateLong(meta.dataAsOf)} · <a href="https://github.com/hopetohelp/26">הקוד והנתונים פתוחים</a> ·{" "}
            <a href="https://github.com/hopetohelp/26/issues">דיווח על טעות</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
