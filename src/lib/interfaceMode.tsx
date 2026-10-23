import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GroupPublic } from "./crowdApi";

export type InterfaceMode = "simple" | "advanced";
export const INTERFACE_KEY = "elections26.interface";
/** קישורים ישירים לכלים קיימים פותחים אותם, בלי לשנות את ההעדפה הקבועה. */
export function requiresAdvanced(path: string, search: string): boolean {
  const q = new URLSearchParams(search);
  if (path.startsWith("/g/") && path !== "/g/hagzara") return true;
  if (path === "/guess" || path.startsWith("/g/")) return ["section", "g", "t", "f", "unit"].some(k => q.has(k));
  return ["/polls", "/today", "/past", "/changes", "/calculator", "/scenarios", "/forecast", "/trends", "/results", "/accuracy", "/voters"].includes(path);
}
const ModeContext = createContext<{ advanced: boolean; toggle: () => void; landing: GroupPublic | null; setLanding: (g: GroupPublic) => void } | null>(null);
export function InterfaceProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  // כל כניסה לאתר נפתחת בתצוגה הממוקדת (הכרעת בעלים 23.10.2026); "למחקר מתקדם" נשמר רק לביקור הנוכחי בלשונית
  const [preferred, setPreferred] = useState<InterfaceMode>(() => { try { localStorage.removeItem(INTERFACE_KEY); return sessionStorage.getItem(INTERFACE_KEY) === "advanced" ? "advanced" : "simple"; } catch { return "simple"; } });
  const [landing, setLanding] = useState<GroupPublic | null>(null);
  const advanced = preferred === "advanced" || requiresAdvanced(location.pathname, location.search);
  const toggle = () => {
    const next = advanced ? "simple" : "advanced";
    setPreferred(next);
    try { sessionStorage.setItem(INTERFACE_KEY, next); } catch { /* הבחירה נשארת לביקור */ }
    if (next === "simple" && requiresAdvanced(location.pathname, location.search)) navigate(location.pathname === "/guess" ? "/guess?view=edit" : "/");
    else if (next === "advanced" && location.pathname === "/community") navigate("/guess?view=statistics");
    requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
  };
  return <ModeContext.Provider value={{ advanced, toggle, landing, setLanding }}>{children}</ModeContext.Provider>;
}
export function useInterface() {
  const value = useContext(ModeContext);
  if (!value) throw new Error("InterfaceProvider required");
  return value;
}
