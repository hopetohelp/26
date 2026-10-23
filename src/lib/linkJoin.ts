import { call } from "./crowdApi";
/**
 * הצטרפות דרך קישור קבוצה (הכרעת בעלים 23.10.2026): הדפדפן זוכר באילו קישורים נכנס, ושולח לשרת כשיש חשבון (עכשיו או אחרי הרשמה).
 * השרת שומר רק את מזהה המשתתף; החבר נספר בקבוצה רק אם המנהל הפעיל את "כל מי שנכנס דרך הקישור".
 */
const KEY = "elections26.link-joins";
type State = Record<string, "pending" | "pending-first" | "sent" | "sent-first">;
/** הדפדפן לא ביקר באתר לפני הטעינה הזו (אין שום מפתח של האתר) — נבדק פעם אחת בטעינת המודול, בתחילת האתר */
const FIRST_VISIT = (() => { try { return !Object.keys(localStorage).some(k => k.startsWith("elections26.")); } catch { return false; } })();
const read = (): State => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as State; } catch { return {}; } };
const write = (s: State) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* בלי אחסון — לא נזכר */ } };
export function rememberLinkJoin(slug: string) {
  const s = read();
  if (!s[slug]) { s[slug] = FIRST_VISIT ? "pending-first" : "pending"; write(s); }
}
/** שולח את הקישורים שעוד לא נשלחו לחשבון הזה. true ⇐ נשלח משהו (כדאי לרענן את החברות) */
export async function syncLinkJoins(token: string): Promise<boolean> {
  const s = read();
  const pending = Object.keys(s).filter(k => s[k].startsWith("pending"));
  let sent = false;
  for (const slug of pending) {
    try { await call("/group/link-join", { token, body: { slug, first: s[slug] === "pending-first" } }); s[slug] = s[slug] === "pending-first" ? "sent-first" : "sent"; sent = true; }
    catch { /* ניסיון חוזר בכניסה הבאה */ }
  }
  if (sent) write(s);
  return sent;
}
/** חשבון אחר בדפדפן ⇐ שולחים שוב לחשבון החדש */
export function resetLinkJoins() {
  const s = read();
  for (const k of Object.keys(s)) if (s[k] === "sent") s[k] = "pending"; else if (s[k] === "sent-first") s[k] = "pending-first";
  write(s);
}
