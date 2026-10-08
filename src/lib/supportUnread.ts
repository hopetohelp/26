import { useEffect, useState } from "react";
import { getToken } from "./crowdSession";
import { FEEDBACK_URL, accountSupport, getThread, primaryThread } from "./feedback";

/** הודעת הפתיחה של צוות האתר — מוצגת לכל משתמש ונכנס בראש שיחת התמיכה (הכרעת בעלים 8.10.2026) */
export const WELCOME = {
  author: "team" as const,
  text: "שלום! כאן צוות האתר. נשמח לשמוע את דעתכם — כל הערה או הארה תתקבל בשמחה!",
  created_at: "2026-10-08T22:00:00Z",
};

/** סימון "לא נקרא" על לשונית התמיכה: הודעה של הצוות (כולל הפתיחה) שחדשה מהביקור האחרון במסך התמיכה */
const SEEN_KEY = "elections26.supportSeen";
const EVENT = "support-seen";
const seenAt = (): string => { try { return localStorage.getItem(SEEN_KEY) ?? ""; } catch { return ""; } };
export function markSupportSeen() {
  try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* בלי אחסון — הסימון יחזור */ }
  window.dispatchEvent(new Event(EVENT));
}

/** זמנים מהשרת עשויים להגיע בלי T/Z — משווים כמספרים */
const ms = (t: string) => { const v = Date.parse(/[TZ]/.test(t) ? t : t.replace(" ", "T") + "Z"); return Number.isFinite(v) ? v : 0; };

let cache: { at: number; latest: string } | null = null;
async function latestTeamMessage(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.latest;
  let latest = WELCOME.created_at;
  try {
    if (FEEDBACK_URL) {
      const token = getToken();
      const saved = primaryThread();
      const thread = token ? await accountSupport(token) : saved ? await getThread(saved.token) : null;
      for (const m of thread?.messages ?? []) if (m.author === "team" && ms(m.created_at) > ms(latest)) latest = m.created_at;
    }
  } catch { /* בלי חיבור — רק הפתיחה */ }
  cache = { at: Date.now(), latest };
  return latest;
}

export function useSupportUnread(pathname: string): boolean {
  const [latest, setLatest] = useState("");
  const [seen, setSeen] = useState(seenAt);
  useEffect(() => {
    let alive = true;
    void latestTeamMessage().then(l => { if (alive) setLatest(l); });
    return () => { alive = false; };
  }, [pathname]);
  useEffect(() => {
    const sync = () => setSeen(seenAt());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return !pathname.startsWith("/support") && latest !== "" && ms(latest) > ms(seen);
}
