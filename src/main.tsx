import { useSearchParams as useCalculatorParams, Navigate as CalculatorRedirect } from "react-router-dom";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Today from "./pages/Today";
import Polls from "./pages/Polls";
import Trends from "./pages/Trends";
import Results from "./pages/Results";
import Voters from "./pages/Voters";
import { MethodLaw, MethodNumbers, MethodSources } from "./pages/Method";
import About from "./pages/About";
import { PageTitle } from "./components/ui";
import Support from "./pages/Support";
const Admin = lazy(() => import("./pages/Admin"));
import MyFeedback from "./pages/MyFeedback";
import Tabbed, { Moved } from "./components/Tabbed";

// סקרי המערכות הקודמות נטענים רק בעמוד שמציג אותם
const Accuracy = lazy(() => import("./pages/Accuracy"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Changes = lazy(() => import("./pages/Changes"));
const Guess = lazy(() => import("./pages/Guess"));

function NotFound() {
  return <PageTitle lead="הכתובת אינה קיימת באתר.">העמוד לא נמצא</PageTitle>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route
            path="today"
            element={<Tabbed label="המצב והתרחישים" tabs={[
              { id: "today", label: "היום", element: <Today /> },
              { id: "scenarios", label: "תחזית ותרחישים", element: <Scenarios /> },
            ]} aliases={{ forecast: "scenarios" }} />}
          />
          <Route
            path="polls"
            element={<Tabbed label="סקרים ומגמות" tabs={[
              { id: "archive", label: "ארכיון", element: <Polls /> },
              { id: "trends", label: "מגמות", element: <Trends /> },
            ]} />}
          />
          <Route path="changes" element={<Suspense fallback={<p className="text-ink-soft">טוען את ההשוואה…</p>}><Changes /></Suspense>} />
          <Route path="calculator" element={<LegacyCalculator />} />
          <Route path="guess" element={<Suspense fallback={<p className="text-ink-soft">טוען…</p>}><LegacyGuess /></Suspense>} />
          <Route path="community" element={<Suspense fallback={<p className="text-ink-soft">טוען…</p>}><Guess community /></Suspense>} />
          <Route
            path="past"
            element={<Tabbed label="בחירות קודמות" tabs={[
              { id: "results", label: "תוצאות אמת", element: <Results /> },
              { id: "accuracy", label: "דיוק הסקרים", element: <Accuracy /> },
              { id: "voters", label: "מצביעים", element: <Voters /> },
            ]} />}
          />
          <Route
            path="method"
            element={<Tabbed
              label="שיטה, מקורות ואודות"
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
          <Route path="scenarios" element={<Moved to="/today" tab="scenarios" />} />
          <Route path="forecast" element={<Moved to="/today" tab="scenarios" />} />
          <Route path="trends" element={<Moved to="/polls" tab="trends" />} />
          <Route path="results" element={<Moved to="/past" tab="results" />} />
          <Route path="accuracy" element={<Moved to="/past" tab="accuracy" />} />
          <Route path="voters" element={<Moved to="/past" tab="voters" />} />
          <Route path="about" element={<Moved to="/method" tab="about" />} />
          <Route path="support" element={<Support />} />
          <Route path="admin" element={<Suspense fallback={<p className="text-ink-soft">טוען…</p>}><Admin /></Suspense>} />
          <Route path="feedback" element={<Moved to="/support" />} />
          <Route path="feedback/:token" element={<MyFeedback />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);

function LegacyCalculator() {
  const [params] = useCalculatorParams();
  const next = new URLSearchParams(params);
  for (const key of ["s", "t", "e", "a"]) {
    const value = next.get(key);
    if (value !== null) { next.set(`c${key}`, value); next.delete(key); }
  }
  next.set("section", "calculator");
  return <CalculatorRedirect replace to={`/guess?${next}`} />;
}

/** קישורים ישנים לסטטיסטיקות נשארים תקינים, לרבות פרמטרי הקישור האישי. */
function LegacyGuess() {
  const [params] = useCalculatorParams();
  if (params.get("view") !== "statistics") return <Guess />;
  const next = new URLSearchParams(params);
  next.delete("view");
  return <CalculatorRedirect replace to={`/community${next.size ? `?${next}` : ""}`} />;
}
