import { StrictMode } from "react";
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
          <Route path="calculator" element={<Calculator />} />
          <Route path="results" element={<Results />} />
          <Route path="voters" element={<Voters />} />
          <Route path="method" element={<Method />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);
