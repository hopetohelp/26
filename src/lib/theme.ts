import { useCallback, useEffect, useState } from "react";

/** שלושת העיצובים שהגולש בוחר ביניהם. הבחירה נשמרת בדפדפן שלו בלבד. */
export const THEMES = [
  { id: "boxes", name: "צעיר", long: "עיצוב צעיר — קיר הקופסאות", color: "#D9622B" },
  { id: "league", name: "מקצועי", long: "עיצוב מקצועי — טבלת הליגה", color: "#FFFFFF" },
  { id: "board", name: "חדשותי", long: "עיצוב חדשותי — לוח המודיעין", color: "#0B2239" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

const KEY = "elections26.theme"; // אותו מפתח בסקריפט הקטן שב-index.html
const DEFAULT: ThemeId = "board";

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
