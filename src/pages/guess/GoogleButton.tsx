import { useEffect, useRef, useState } from "react";
import { call, CrowdError } from "../../lib/crowdApi";
import { setConsent, setPicture } from "../../lib/crowdSession";
import ErrorReport from "../../components/ErrorReport";
import { errorText, type useSession } from "./useCrowd";

/** מזהה הלקוח של Google — גלוי, לא סוד (הכרעת בעלים 8.10.2026). VITE_GOOGLE_CLIENT_ID גובר. */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "842977993302-8n4sibbf7rgr6e1ludvi28oojua9ht9t.apps.googleusercontent.com";

type Gsi = { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
let loading: Promise<Gsi> | null = null;
function loadGsi(): Promise<Gsi> {
  const w = window as unknown as { google?: Gsi };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error("gsi")));
    s.onerror = () => { loading = null; reject(new Error("gsi")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** תמונת הפרופיל מתוך אסימון Google (נקרא בדפדפן בלבד; השרת מאמת את האסימון בעצמו) */
export function pictureOf(credential: string): string | null {
  try {
    const part = credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(decodeURIComponent(escape(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")))));
    return typeof claims.picture === "string" ? claims.picture : null;
  } catch {
    return null;
  }
}

/**
 * כפתור "המשך עם Google". Google מאמת בדפדפן ⇐ POST /auth/google עם האסימון. גם כשתשובת השרת נחסמת בדרך,
 * הדפדפן ממשיך עם אסימון הסשן שיצר (src/lib/crowdApi.ts, BLIND) — בלי סיכון של סיסמה שגויה.
 * המייל נשמר בשרת מוצפן (חשבון אחד לכל מייל); תמונת הפרופיל נשמרת רק בדפדפן הזה.
 */
export default function GoogleButton({ session, onDone, disabled }: { session: ReturnType<typeof useSession>; onDone?: (token: string) => void; disabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "busy">("loading");
  const [err, setErr] = useState<{ text: string; log: string } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (disabled) return;
    let live = true;
    loadGsi().then((g) => {
      if (!live || !box.current) return;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        ux_mode: "popup",
        callback: async ({ credential }: { credential: string }) => {
          setState("busy");
          setErr(null);
          try {
            const r = await call<{ token: string }>("/auth/google", { token: session.token, body: { credential } });
            setConsent(true);
            setPicture(pictureOf(credential));
            session.setToken(r.token);
            done.current?.(r.token);
          } catch (e) {
            setErr({ text: errorText(e), log: JSON.stringify({ action: "כניסה עם Google", ...(e instanceof CrowdError ? { code: e.code, status: e.status, ...e.diagnostic } : { code: "unexpected" }) }, null, 2) });
          } finally {
            setState("ready");
          }
        },
      });
      g.accounts.id.renderButton(box.current, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: "he", width: Math.min(box.current.clientWidth || 320, 400) });
      setState("ready");
    }).catch(() => live && setState("unavailable"));
    return () => { live = false; };
  }, [disabled, session]);

  if (disabled) return null;
  return (
    <div className="space-y-2">
      <div ref={box} className="min-h-[44px] w-full flex justify-center" aria-busy={state === "loading" || state === "busy"} />
      {state === "busy" && <p role="status" className="text-sm">מתחברים…</p>}
      {state === "unavailable" && <p className="text-xs text-ink">הכניסה עם Google לא נטענה אצלכם. אפשר להירשם או להיכנס במייל.</p>}
      {err && <ErrorReport error={err.text} errorLog={err.log} />}
    </div>
  );
}
