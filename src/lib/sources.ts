/**
 * מקור אמת אחד לכל ממוצע באתר (הכרעת בעלים 10.10.2026). כל מסך קורא מכאן, ולא מחשב או מעתיק בעצמו.
 *
 * - **ממוצע המודל** — מ-model.json (המודל שהצינור בונה מחדש בכל רענון נתונים, כל 4 שעות).
 * - **ממוצע המשתתפים** — מהסטטיסטיקות: העותק שבאתר מוצג מיד, והשרת מחליף אותו כשהוא חדש יותר;
 *   רענון כל דקה כשהדף גלוי, מיד כשחוזרים אליו, ואחרי כל שמירה. מאגר אחד לכל המסכים.
 */
import { useEffect, useSyncExternalStore } from "react";

import { liveDashboard, newerDashboard, siteDashboard, type Dashboard } from "./crowdApi";
import { OUTBOX_EVENT, SAVED_EVENT } from "./outbox";

export { MODEL_AVERAGE } from "./dataResolver";

// ---- ממוצע המשתתפים: מאגר משותף

const LIVE_REFRESH_MS = 60_000;
type CrowdState = { dashboard: Dashboard | null; failed: boolean };
let state: CrowdState = { dashboard: null, failed: false };
const listeners = new Set<() => void>();
let users = 0;
let stop: (() => void) | null = null;
const emit = () => listeners.forEach((l) => l());
const show = (x: Dashboard) => { state = { dashboard: newerDashboard(state.dashboard, x), failed: false }; emit(); };

/** פעם אחת, בלי רענון קבוע (סרטון הנתונים): הנתונים שבדף כשמסך פעיל מרענן אותם, אחרת בקשה אחת (וגיבוי מהעותק שבאתר) */
export async function crowdDashboardOnce(): Promise<Dashboard | null> {
  if (users > 0 && state.dashboard) return state.dashboard;
  const x = await liveDashboard().catch(() => siteDashboard().catch(() => null));
  if (x) show(x);
  return state.dashboard;
}

function start() {
  void Promise.allSettled([siteDashboard().then(show), liveDashboard().then(show)]).then(() => {
    if (!state.dashboard) { state = { ...state, failed: true }; emit(); }
  });
  const live = () => { if (document.visibilityState === "visible") liveDashboard().then(show).catch(() => {}); };
  const timer = window.setInterval(live, LIVE_REFRESH_MS);
  document.addEventListener("visibilitychange", live);
  window.addEventListener(OUTBOX_EVENT, live);
  window.addEventListener(SAVED_EVENT, live);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", live);
    window.removeEventListener(OUTBOX_EVENT, live);
    window.removeEventListener(SAVED_EVENT, live);
  };
}

/** הסטטיסטיקות של המשתתפים, מתעדכנות לבד. failed — גם העותק שבאתר וגם השרת לא זמינים. */
export function useCrowdDashboard(): CrowdState {
  useEffect(() => {
    if (users++ === 0) stop = start();
    return () => { if (--users === 0) { stop?.(); stop = null; } };
  }, []);
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}

/** ממוצע המשתתפים לכל רשימה: מנדטים, ואחוזים (מכל ההשערות). null כשאין סטטיסטיקות. */
export function crowdAverage(d: Dashboard | null): {
  seats: Record<string, number> | null; pct: Record<string, number> | null; asOf: string | null;
  /** הנמוך והגבוה בין ההשערות, לכל רשימה */
  seatsRange: Record<string, [number, number]> | null; pctRange: Record<string, [number, number]> | null;
} {
  const open = !!d?.open && !!d.seats?.n;
  const seats = open && d!.seats!.full.length ? d!.seats!.full : null;
  const pct = open && d!.seats!.pctStats?.length ? d!.seats!.pctStats : null;
  return {
    seats: seats && Object.fromEntries(seats.map((s) => [s.list, s.mean])),
    pct: pct && Object.fromEntries(pct.map((s) => [s.list, s.mean])),
    seatsRange: seats && Object.fromEntries(seats.map((s) => [s.list, [s.min, s.max] as [number, number]])),
    pctRange: pct && Object.fromEntries(pct.map((s) => [s.list, [s.min, s.max] as [number, number]])),
    asOf: d?.publishedAt ?? null,
  };
}
export const useCrowdAverage = () => crowdAverage(useCrowdDashboard().dashboard);
