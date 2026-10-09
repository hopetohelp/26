/**
 * התקנת האתר כאפליקציה במסך הבית (public/manifest.webmanifest + public/sw.js).
 * אנדרואיד ומחשב: כפתור שפותח את חלון ההתקנה של הדפדפן. אייפון: הדפדפן אינו מאפשר כפתור — מוצגת הוראה קצרה.
 * כשהאתר כבר פתוח כאפליקציה, או אחרי "לא עכשיו" — לא מוצג.
 */
import { useEffect, useState } from "react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "elections26.install.dismissed";
let deferred: PromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as PromptEvent; window.dispatchEvent(new Event("install-ready")); });
}

const standalone = () => typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const ios = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
function dismissed() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }

export default function InstallApp() {
  const [ready, setReady] = useState(!!deferred);
  const [hidden, setHidden] = useState(() => standalone() || dismissed());
  useEffect(() => {
    const on = () => setReady(true);
    const done = () => setHidden(true);
    window.addEventListener("install-ready", on);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("install-ready", on); window.removeEventListener("appinstalled", done); };
  }, []);
  if (hidden || (!ready && !ios())) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* רק לביקור הזה */ } setHidden(true); };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === "accepted") setHidden(true); else setReady(false);
  };
  return (
    <aside aria-labelledby="install-h" className="mt-10 rounded-theme border-2 border-paper-line bg-paper-card text-ink p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex-1 min-w-[14rem]">
        <h2 id="install-h" className="text-xl font-display leading-tight">האתר כאפליקציה</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {ready ? "אייקון במסך הבית, נפתח במסך מלא — גם בלי אינטרנט." : <>בספארי: כפתור השיתוף ⇐ ״הוספה למסך הבית״ <bdi className="whitespace-nowrap">(Add to Home Screen)</bdi>.</>}
        </p>
      </div>
      <div className="flex gap-2">
        {ready && <button type="button" onClick={() => void install()} className="min-h-[44px] px-5 rounded-full border-2 border-ink bg-ink text-paper-card text-sm font-bold">התקנה</button>}
        <button type="button" onClick={close} className="min-h-[44px] px-4 rounded-full border-2 border-paper-line bg-paper-card text-ink text-sm font-bold">לא עכשיו</button>
      </div>
    </aside>
  );
}
