import { useCallback, useEffect, useState } from "react";

/** שני העיצובים (הצעיר הוסר אחרי ביקורת משתמשים: עיוות את הגרפים — הכרעת בעלים 6.10.2026) שהגולש בוחר ביניהם. הבחירה נשמרת בדפדפן שלו בלבד. */
export const THEMES = [
  { id: "league", name: "מקצועי", long: "עיצוב מקצועי — טבלת הליגה", color: "#FFFFFF" },
  { id: "board", name: "חדשותי", long: "עיצוב חדשותי — לוח המודיעין", color: "#0B2239" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

const KEY = "elections26.theme"; // אותו מפתח בסקריפט הקטן שב-index.html
const DEFAULT: ThemeId = "league"; // הכרעת בעלים 8.10.2026: ברירת המחדל — מקצועי

function read(): ThemeId {
  try {
    const t = localStorage.getItem(KEY);
    if (THEMES.some((x) => x.id === t)) return t as ThemeId;
  } catch {
    /* דפדפן חסום לאחסון — עיצוב ברירת המחדל */
  }
  return DEFAULT;
}

const listeners = new Set<(t: ThemeId) => void>();

/** הבעלים היחיד של בחירת העיצוב: קורא, שומר ומחיל על <html data-theme> */
export function useTheme(): [ThemeId, (t: ThemeId) => void] {
  const [theme, setThemeState] = useState<ThemeId>(read);
  useEffect(() => {
    listeners.add(setThemeState);
    return () => {
      listeners.delete(setThemeState);
    };
  }, []);
  const setTheme = useCallback((t: ThemeId) => {
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", THEMES.find((x) => x.id === t)!.color);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* לא נשמר — רק לביקור הזה */
    }
    listeners.forEach((l) => l(t));
  }, []);
  return [theme, setTheme];
}

/** תצורה: בהיר · חשוך · לפי המכשיר (ברירת מחדל). נפרדת מהעיצוב — כל עיצוב קיים בשתי התצורות. */
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
