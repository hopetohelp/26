/**
 * כניסה אחת בעמוד המוטמע (הכרעת בעלים 01.11.2026, תוכנית סקרי הגזרה סעיף 4 — דרך א):
 * אתר הגזרה, שבו המשתמש כבר מחובר עם Google, שולח לחלון המוטמע את אסימון הזהות של Google (ID token).
 * החלון מקבל אותו רק מכתובות שהוגדרו (VITE_HAGZARA_ORIGINS), ושולח לשרת; השרת מאשר רק מזהה לקוח שהוגדר (GOOGLE_EXTRA_CLIENT_IDS).
 * בלי הגדרה — אין שינוי: הכניסה בכפתור "המשך עם Google" כרגיל.
 *
 * באתר המארח (לצוות הגזרה):
 *   addEventListener("message", (m) => {
 *     if (m.origin === "https://26.hopetohelp.net" && m.data?.type === "elections26:need-login")
 *       m.source.postMessage({ type: "hagzara:google-credential", credential: ID_TOKEN_OF_SIGNED_IN_USER }, m.origin);
 *   });
 */
import { useEffect } from "react";
import { call } from "./crowdApi";
import type { useSession } from "../pages/guess/useCrowd";

export const HOST_ORIGINS = String(import.meta.env.VITE_HAGZARA_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const NEED_LOGIN = "elections26:need-login";
export const CREDENTIAL = "hagzara:google-credential";

/** האם הודעה מהחלון המארח היא אסימון כניסה תקין מכתובת מורשית */
export function credentialFrom(origin: string, data: unknown, allowed = HOST_ORIGINS): string | null {
  if (!allowed.includes(origin)) return null;
  const d = data as { type?: unknown; credential?: unknown } | null;
  return d && d.type === CREDENTIAL && typeof d.credential === "string" && d.credential.split(".").length === 3 && d.credential.length < 4096 ? d.credential : null;
}

/** בחלון מוטמע בלי כניסה: מבקש מהאתר המארח אסימון, ונכנס איתו */
export function useHostLogin(session: ReturnType<typeof useSession>, active: boolean) {
  const { token, setToken } = session;
  useEffect(() => {
    if (!active || token || !HOST_ORIGINS.length || window.parent === window) return;
    const onMessage = (m: MessageEvent) => {
      const credential = credentialFrom(m.origin, m.data);
      if (!credential) return;
      void call<{ token: string }>("/auth/google", { body: { credential } }).then((r) => setToken(r.token), () => { /* נשאר כפתור הכניסה הרגיל */ });
    };
    window.addEventListener("message", onMessage);
    for (const o of HOST_ORIGINS) window.parent.postMessage({ type: NEED_LOGIN }, o);
    return () => window.removeEventListener("message", onMessage);
  }, [active, token, setToken]);
}
