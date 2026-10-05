import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Polls from "./pages/Polls";
import Trends from "./pages/Trends";
import Calculator from "./pages/Calculator";
import Results from "./pages/Results";
import Voters from "./pages/Voters";
import Method from "./pages/Method";
import About from "./pages/About";
import { PageTitle } from "./components/ui";

// סקרי המערכות הקודמות נטענים רק בעמוד שמציג אותם
const Accuracy = lazy(() => import("./pages/Accuracy"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Changes = lazy(() => import("./pages/Changes"));
const MyFeedback = lazy(() => import("./pages/MyFeedback"));

function NotFound() {
  return <PageTitle lead="הכתובת אינה קיימת באתר.">העמוד לא נמצא</PageTitle>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="polls" element={<Polls />} />
          <Route path="trends" element={<Trends />} />
          <Route
            path="scenarios"
            element={
              <Suspense fallback={<p className="text-ink-soft">טוען את התרחישים…</p>}>
                <Scenarios />
              </Suspense>
            }
          />
          <Route
            path="changes"
            element={
              <Suspense fallback={<p className="text-ink-soft">טוען את ההשוואה…</p>}>
                <Changes />
              </Suspense>
            }
          />
          <Route path="feedback" element={<Suspense fallback={null}><MyFeedback /></Suspense>} />
          <Route path="feedback/:token" element={<Suspense fallback={null}><MyFeedback /></Suspense>} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="results" element={<Results />} />
          <Route
            path="accuracy"
            element={
              <Suspense fallback={<p className="text-ink-soft">טוען את סקרי המערכות הקודמות…</p>}>
                <Accuracy />
              </Suspense>
            }
          />
          <Route path="voters" element={<Voters />} />
          <Route path="method" element={<Method />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);
