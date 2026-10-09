import { useCallback, useEffect, useState } from "react";

/** עיצוב אחד בלבד: מקצועי (הכרעת בעלים 9.10.2026; בורר העיצוב והעיצוב החדשותי הוסרו). נשארה רק התצורה: יום, לילה, לפי המכשיר. */

/** תצורה: בהיר · חשוך · לפי המכשיר (ברירת מחדל). */
export const MODES = [
  { id: "light", name: "יום" },
  { id: "dark", name: "לילה" },
  { id: "auto", name: "לפי המכשיר" },
] as const;
export type ModeId = (typeof MODES)[number]["id"];

const MODE_KEY = "elections26.mode"; // אותו מפתח בסקריפט הקטן שב-index.html
const dark = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function readMode(): ModeId {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (MODES.some((x) => x.id === m)) return m as ModeId;
  } catch {
    /* דפדפן חסום לאחסון */
  }
  return "auto";
}

/** מחיל את התצורה על <html data-dark> */
function applyMode(m: ModeId) {
  const on = m === "dark" || (m === "auto" && !!dark?.matches);
  if (on) document.documentElement.dataset.dark = "";
  else delete document.documentElement.dataset.dark;
}

const modeListeners = new Set<(m: ModeId) => void>();

/** הבעלים היחיד של בחירת התצורה: קורא, שומר, מחיל, ועוקב אחרי המכשיר במצב "לפי המכשיר" */
export function useMode(): [ModeId, (m: ModeId) => void] {
  const [mode, setModeState] = useState<ModeId>(readMode);
  useEffect(() => {
    modeListeners.add(setModeState);
    const onChange = () => applyMode(readMode());
    dark?.addEventListener("change", onChange);
    return () => {
      modeListeners.delete(setModeState);
      dark?.removeEventListener("change", onChange);
    };
  }, []);
  const setMode = useCallback((m: ModeId) => {
    applyMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* לא נשמר — רק לביקור הזה */
    }
    modeListeners.forEach((l) => l(m));
  }, []);
  return [mode, setMode];
}
