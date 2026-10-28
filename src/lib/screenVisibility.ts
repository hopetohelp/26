import { useSyncExternalStore } from "react";
import { FEEDBACK_URL } from "./feedback";
import { getToken } from "./crowdSession";

/** מסכים שהוסתרו מהאתר, ומתג לכל אחד במסך הניהול (הכרעת בעלים 28.10.2026): מוסתר · רק למנהלים · לכולם */
export type ScreenMode = "off" | "admins" | "all";
export const HIDDEN_SCREENS = [
  { id: "overview", label: "האחרונים (תמונת המצב הקודמת)", where: "לשונית בסקרים" },
  { id: "today", label: "היום", where: "לשונית בסקרים" },
  { id: "guess", label: "הניחוש שלי", where: "בסרגל; צפייה בלבד — השמירה נשארת חסומה בשרת" },
] as const;
export type HiddenScreen = (typeof HIDDEN_SCREENS)[number]["id"];
export const ADMIN_KEY = "elections26.admin";

let state: { modes: Partial<Record<HiddenScreen, ScreenMode>>; admin: boolean } = { modes: {}, admin: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
let started = false;
/** מפתח הניהול שבדפדפן, ואם אין — הסשן של החשבון (כמו במסך הניהול) */
const credential = () => { try { return localStorage.getItem(ADMIN_KEY) ?? getToken(); } catch { return getToken(); } };
async function load() {
  if (!FEEDBACK_URL) return;
  try {
    const r = await fetch(`${FEEDBACK_URL}/screens`, { cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    state = { ...state, modes: j?.screens ?? {} };
    emit();
    // רק כשיש מסך "למנהלים" בודקים אם הגולש מנהל
    const key = credential();
    if (key && Object.values(state.modes).includes("admins")) {
      const a = await fetch(`${FEEDBACK_URL}/admin/screens`, { cache: "no-store", headers: { authorization: `Bearer ${key}` } });
      state = { ...state, admin: a.ok }; emit();
    }
  } catch { /* בלי חיבור — המסכים נשארים מוסתרים */ }
}
/** אחרי שמירה במסך הניהול */
export function setScreenModes(modes: Partial<Record<HiddenScreen, ScreenMode>>) { state = { modes, admin: true }; emit(); }
export function useScreenModes() {
  return useSyncExternalStore(l => { listeners.add(l); if (!started) { started = true; void load(); } return () => { listeners.delete(l); }; }, () => state, () => state);
}
/** האם להציג מסך מוסתר לגולש הזה */
export function useScreenShown(id: HiddenScreen): boolean {
  const s = useScreenModes();
  const m = s.modes[id] ?? "off";
  return m === "all" || (m === "admins" && s.admin);
}
