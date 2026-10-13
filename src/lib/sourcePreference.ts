import { useSyncExternalStore } from "react";
import { call } from "./crowdApi";
import { getToken } from "./crowdSession";
import { cleanDataPreference, newerPreference, type DataPreference } from "./dataPreferences";
import { sourceAllowed, type DataScreen } from "./dataCatalog";
import type { Selection } from "./dataResolver";
let account: string | null = null;
let scopedToken = getToken();
let state: DataPreference | null = null;
const listeners = new Set<() => void>();
const memory = new Map<string, DataPreference>();
const key = (id: string | null) => `elections26.source.v1.${id ?? "guest"}`;
const read = (id: string | null): DataPreference | null => {
  try { return newerPreference(memory.get(key(id)) ?? null, cleanDataPreference(JSON.parse(localStorage.getItem(key(id)) ?? "null"))); } catch { return memory.get(key(id)) ?? null; }
};
const write = (id: string | null, p: DataPreference) => {
  memory.set(key(id), p);
  try { localStorage.setItem(key(id), JSON.stringify(p)); return true; } catch { return false; /* אחסון חסום: זיכרון לביקור */ }
};
const emit = () => listeners.forEach(l => l());
if (typeof window !== "undefined") {
  state = getToken() ? null : read(null);
  window.addEventListener("storage", () => { if (getToken() !== scopedToken) clearSourceAccount(); else { state = read(account); emit(); } });
  window.addEventListener("crowd-clear", () => { if (!getToken()) { account = null; state = read(null); emit(); } });
}
/** מחליפים תחום אחסון כשמחליפים חשבון, בלי להעתיק העדפה של משתמש קודם. */
export function adoptSourcePreference(id: string, remote: unknown) {
  account = id;
  scopedToken = getToken();
  state = newerPreference(read(id), cleanDataPreference(remote));
  if (state) write(id, state);
  emit();
}
export function clearSourceAccount() { scopedToken = getToken(); account = null; state = getToken() ? null : read(null); emit(); }
/** העדפת אורח מועברת רק בהרשמה/כניסה מפורשת, מול מועד השינוי בחשבון. */
export async function syncSourcePreference(token: string, id: string, remote: unknown) {
  const guest = read(null);
  const current = cleanDataPreference(remote);
  const chosen = newerPreference(guest, current);
  let confirmed = chosen;
  if (guest && chosen === guest) {
    const response = await call<{ dataSource: unknown }>("/prefs", { token, body: { dataSource: guest } });
    confirmed = cleanDataPreference(response.dataSource);
  }
  if (token !== getToken()) return;
  adoptSourcePreference(id, confirmed);
  if (guest) { memory.delete(key(null)); try { localStorage.removeItem(key(null)); } catch { /* זיכרון בלבד */ } }
}
export async function synchronizeOwnedSource(token: string, id: string, remote: unknown) {
  const local = read(id);
  const server = cleanDataPreference(remote);
  if (local && newerPreference(local, server) === local && local.updatedAt !== server?.updatedAt) {
    try {
      const response = await call<{ dataSource: unknown }>("/prefs", { token, body: { dataSource: local } });
      if (token === getToken()) adoptSourcePreference(id, response.dataSource);
    } catch { if (token === getToken()) adoptSourcePreference(id, server); }
  } else if (token === getToken()) adoptSourcePreference(id, server);
}
export async function saveSourcePreference(selection: Selection): Promise<"account" | "local" | "session"> {
  const average = selection.product === "poll.single" ? state?.preferredAverage ?? "polls.adjusted" : selection.product;
  const next: DataPreference = { version: 1, selection, preferredAverage: average, updatedAt: new Date().toISOString() };
  // זהות חשבון נדרשת לפני שמירה: אין כתיבה לתחום האורח בסשן מחובר.
  if (getToken() && (!account || getToken() !== scopedToken)) throw new Error("פרטי החשבון עדיין נטענים. נסו שוב.");
  const owner = account;
  const persisted = write(owner, next); state = next; emit();
  const token = getToken();
  if (token && owner) {
    const response = await call<{ dataSource: unknown }>("/prefs", { token, body: { dataSource: next } });
    if (account === owner) adoptSourcePreference(owner, response.dataSource);
    return "account";
  }
  return persisted ? "local" : "session";
}
export function useSourcePreference(screen: DataScreen) {
  const p = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state, () => null);
  const wanted: Selection = p?.selection ?? { product: screen === "home" ? "polls.adjusted" : "polls.mean" };
  if (sourceAllowed(screen, wanted.product)) return { selection: wanted, preference: p, notice: null };
  const fallback = p?.preferredAverage;
  const selection: Selection = { product: fallback && sourceAllowed(screen, fallback) ? fallback : "polls.mean" };
  return { selection, preference: p, notice: "המקור המועדף אינו מתאים למסך הזה. המקור שמוצג נבחר לפי מדיניות המסך." };
}
