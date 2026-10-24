import { useInterface } from "./lib/interfaceMode";
import SimpleOverview from "./pages/simple/Overview";
import SimpleComparison from "./pages/simple/Comparison";
import { SHOW_MODEL } from "./lib/modelVisibility";
import { useSearchParams as useCalculatorParams, Navigate as CalculatorRedirect } from "react-router-dom";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import "./index.css";
// מסכי המחקר המתקדם נטענים רק כשנכנסים אליהם. אחרי פרסום גרסה חדשה קובץ ישן עלול לחסור — רענון אחד טוען את הגרסה החדשה.
window.addEventListener("vite:preloadError", (e) => {
  try { if (sessionStorage.getItem("elections26.chunk-reload")) return; sessionStorage.setItem("elections26.chunk-reload", "1"); } catch { return; }
  e.preventDefault();
  location.reload();
});
import { startOutbox } from "./lib/outbox";
import { registerOffline } from "./lib/offline";
import { completeLegacyHandoff, keepNewLegacyHandoff, receiveLegacyMigration } from "./lib/legacyMigration";
import Layout from "./components/Layout";
import RootErrorBoundary from "./components/RootErrorBoundary";
const Home = lazy(() => import("./pages/Home"));
const Today = lazy(() => import("./pages/Today"));
const Polls = lazy(() => import("./pages/Polls"));
const Trends = lazy(() => import("./pages/Trends"));
const Results = lazy(() => import("./pages/Results"));
import { MethodLaw, MethodNumbers, MethodSources } from "./pages/Method";
const About = lazy(() => import("./pages/About"));
import { PageTitle } from "./components/ui";
import Support from "./pages/Support";
import VerifyEmail from "./pages/VerifyEmail";
import ResetPassword from "./pages/ResetPassword";
import { setVerifyCode } from "./lib/verifyEmail";
import { setResetSecret, SECRET_RE } from "./lib/resetPassword";
const Admin = lazy(() => import("./pages/Admin"));
const MyFeedback = lazy(() => import("./pages/MyFeedback"));
const Connect = lazy(() => import("./pages/Connect"));
import Tabbed, { Moved } from "./components/Tabbed";

// סקרי המערכות הקודמות נטענים רק בעמוד שמציג אותם
const Accuracy = lazy(() => import("./pages/Accuracy"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Changes = lazy(() => import("./pages/Changes"));
const Guess = lazy(() => import("./pages/Guess"));
const GroupLanding = lazy(() => import("./pages/GroupLanding"));

function NotFound() {
  return <PageTitle lead="הכתובת אינה קיימת באתר.">העמוד לא נמצא</PageTitle>;
}

// כרטיס מעבר מגיע בעוגן בלבד. מוחקים אותו מהכתובת לפני טעינת האתר או קריאות רשת נוספות.
const handoffTicket = location.origin === "https://26.hopetohelp.net" ? /^#handoff=([\w-]{43})$/.exec(location.hash)?.[1] : undefined;
if (handoffTicket) history.replaceState(null, "", location.pathname + location.search);

// קישור אימות המייל של Firebase מגיע לאתר כ-?mode=verifyEmail&oobCode=… (לפני ה-#). מעבירים אותו לדף האימות, בלי להשאיר את הקוד בכתובת.
{
  const q = new URLSearchParams(location.search);
  const code = q.get("oobCode");
  // איפוס סיסמה: הסוד חוזר בכתובת ההמשך של Firebase (?reset=…), ואם הוגדר "Customize action URL" — בתוך continueUrl של קישור האימות
  let reset = q.get("reset");
  const cont = q.get("continueUrl");
  if (!reset && cont) { try { reset = new URL(cont).searchParams.get("reset"); } catch { /* כתובת שבורה — מתעלמים */ } }
  if (reset && SECRET_RE.test(reset)) {
    setResetSecret(reset);
    history.replaceState(null, "", `${location.pathname}#/reset-password`);
  } else if (q.get("mode") === "verifyEmail" && code && /^[\w-]{10,300}$/.test(code)) {
    setVerifyCode(code);
    history.replaceState(null, "", `${location.pathname}#/verify-email`);
  }
}

// שמירה מקומית קודם: השערות והערות שלא הגיעו לשרת נשלחות שוב אוטומטית; האתר עצמו נשמר במכשיר לפתיחה גם בלי רשת
const migrationOnly = location.origin === "https://26.hopetohelp.net" && new URLSearchParams(location.search).get("migration") === "1";
if (handoffTicket) {
  // לפני רישום ביקור ושליחת טיוטות: אסימון החשבון הישן צריך להיקלט ראשון.
  const root = createRoot(document.getElementById("root")!);
  function screen(kind: "loading" | "conflict" | "error", next?: string) {
    root.render(<main className="min-h-screen bg-paper px-4 py-16 text-ink flex items-center justify-center" dir="rtl">
      <section className="w-full max-w-xl rounded-xl border border-paper-line bg-paper-card p-8 shadow-lg sm:p-12">
        <p className="text-sm font-bold text-accent">בחירות 2026 · מעבר לכתובת הפרטית</p>
        <h1 className="font-display text-3xl sm:text-4xl mt-5 mb-4">{kind === "loading" ? "מעבירים אותך לאתר" : kind === "conflict" ? "נמצא מידע בשני האתרים" : "לא הצלחנו להשלים את המעבר"}</h1>
        <p className="text-ink-soft">{kind === "loading" ? "המידע נשמר ואותו עמוד ייפתח מיד." : kind === "conflict" ? "באתר החדש כבר שמור מידע אחר. בחר איזה מידע לשמור; לא החלפנו דבר בלי החלטתך." : "המידע בכתובת הישנה נשמר. אפשר לנסות שוב או להמשיך לאתר החדש."}</p>
        {kind !== "loading" && <div className="flex flex-wrap gap-3 mt-8">
          <button className="rounded-lg bg-signal px-5 py-3 font-bold text-signal-ink" onClick={() => void attempt(kind === "conflict")}>{kind === "conflict" ? "להשתמש במידע מהאתר הישן" : "לנסות שוב"}</button>
          <a className="rounded-lg border border-paper-line px-5 py-3 font-bold" href={next || "https://26.hopetohelp.net/"} onClick={(event) => {
            if (kind !== "conflict" || !next) return;
            event.preventDefault();
            void keepNewLegacyHandoff(handoffTicket!).catch(() => {}).finally(() => location.replace(next));
          }}>להמשיך עם המידע באתר החדש</a>
        </div>}
        {kind === "conflict" && <p className="mt-5 text-sm text-ink-soft">בחירה במידע הישן תחליף את ההתחברות והטיוטות המקומיות השונות שכבר שמורות באתר החדש. אם ממשיכים עם המידע החדש, המידע הישן נשאר בדפדפן הישן.</p>}
      </section>
    </main>);
  }
  async function attempt(replace = false) {
    screen("loading");
    const result = await completeLegacyHandoff(handoffTicket!, replace);
    if (result.kind === "done" && result.next) location.replace(result.next);
    else screen(result.kind === "conflict" ? "conflict" : "error", result.next);
  }
  void attempt();
} else if (migrationOnly) {
  // חלון העברה זמני: בלי רינדור האתר ובלי רישום ביקור לפני העתקת מזהה הביקור מהכתובת הישנה.
  receiveLegacyMigration();
  const root = document.getElementById("root")!;
  root.textContent = "מעבירים מידע מהאתר הישן…";
  const link = document.createElement("a");
  link.href = "https://26.hopetohelp.net/";
  link.textContent = "מעבר לאתר";
  root.appendChild(link);
} else {
startOutbox();
registerOffline();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ModeHome />} />
          <Route path="today" element={<LegacyToday />} />
          <Route path="scenarios" element={SHOW_MODEL ? <Suspense fallback={<p>טוען תרחישים…</p>}><Scenarios /></Suspense> : <Moved to="/polls" />} />
          <Route path="polls" element={<Tabbed label="סקרים" tabs={[
            { id: "today", label: "היום", element: <Today /> },
            { id: "trends", label: "מגמות", element: <Trends /> },
            { id: "archive", label: "ארכיון", element: <Polls /> },
          ]} />} />
          <Route path="changes" element={<Moved to="/past" tab="changes" />} />
          <Route path="calculator" element={<LegacyCalculator />} />
          <Route path="guess" element={<Suspense fallback={<p className="text-ink-soft">טוען…</p>}><LegacyGuess /></Suspense>} />
          <Route path="community" element={<LegacyCommunity />} />
          <Route path="g/:slug" element={<Suspense fallback={<p className="text-ink-soft">טוען…</p>}><GroupLanding /></Suspense>} />
          <Route
            path="past"
            element={<Tabbed label="בחירות קודמות" aliases={{ voters: "results" }} tabs={[
              { id: "results", label: "תוצאות אמת", element: <Results /> },
              { id: "accuracy", label: "דיוק הסקרים", element: <Accuracy /> },
              { id: "changes", label: "מה השתנה", element: <Changes /> },
            ]} />}
          />
          <Route
            path="method"
            element={<Tabbed
              label="מידע"
              aliases={{ method: "numbers" }}
              anchors={{ sources: "sources", updates: "sources", privacy: "sources", law: "law", limits: "law", about: "about" }}
              tabs={[
                { id: "numbers", label: "מילון המספרים", element: <MethodNumbers /> },
                { id: "sources", label: "מקורות", element: <MethodSources /> },
                { id: "law", label: "החוק", element: <MethodLaw /> },
                { id: "about", label: "אודות", element: <About /> },
              ]}
            />}
          />
          <Route path="forecast" element={<Moved to="/today" tab="scenarios" />} />
          <Route path="trends" element={<Moved to="/polls" tab="trends" />} />
          <Route path="results" element={<Moved to="/past" tab="results" />} />
          <Route path="accuracy" element={<Moved to="/past" tab="accuracy" />} />
          <Route path="voters" element={<Moved to="/past" tab="voters" />} />
          <Route path="about" element={<Moved to="/method" tab="about" />} />
          <Route path="support" element={<Support />} />
          <Route path="connect" element={<Connect />} />
          <Route path="verify-email" element={<VerifyEmail />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="admin" element={<Suspense fallback={<p className="text-ink-soft">טוען…</p>}><Admin /></Suspense>} />
          <Route path="feedback" element={<Moved to="/support" />} />
          <Route path="feedback/:token" element={<MyFeedback />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
    </RootErrorBoundary>
  </StrictMode>,
);
}

function LegacyCalculator() {
  const [params] = useCalculatorParams();
  const next = new URLSearchParams(params);
  for (const key of ["s", "t", "e", "a"]) {
    const value = next.get(key);
    if (value !== null) { next.set(`c${key}`, value); next.delete(key); }
  }
  next.set("section", "seats");
  next.set("unit", "pct");
  return <CalculatorRedirect replace to={`/guess?${next}`} />;
}

/** קישורים ישנים לסטטיסטיקות נשארים תקינים, לרבות פרמטרי הקישור האישי. */
function LegacyGuess() {
  return <Guess />;
}

function LegacyCommunity() {
  const { advanced } = useInterface();
  const [params] = useCalculatorParams();
  const next = new URLSearchParams(params);
  next.set("view", "statistics");
  if (!advanced) return <SimpleComparison />;
  return <CalculatorRedirect replace to={`/guess?${next}`} />;
}

function LegacyToday() {
  const [params] = useCalculatorParams();
  const next = new URLSearchParams(params);
  const scenarios = ["scenarios", "forecast"].includes(next.get("tab") ?? "");
  next.delete("tab");
  return <CalculatorRedirect replace to={`${scenarios ? "/scenarios" : "/polls"}${next.size ? `?${next}` : ""}`} />;
}

function ModeHome() {
  const { advanced } = useInterface();
  return advanced ? <Home /> : <SimpleOverview />;
}
