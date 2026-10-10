/**
 * מקור אמת אחד לכל ממוצע באתר (הכרעת בעלים 10.10.2026). כל מסך קורא מכאן, ולא מחשב או מעתיק בעצמו.
 *
 * - **ממוצע הסקרים** — מ-model.json (המודל שהצינור בונה מחדש בכל רענון נתונים, כל 4 שעות).
 * - **ממוצע הגולשים** — מהסטטיסטיקות: העותק שבאתר מוצג מיד, והשרת מחליף אותו כשהוא חדש יותר;
 *   רענון כל דקה כשהדף גלוי, מיד כשחוזרים אליו, ואחרי כל שמירה. מאגר אחד לכל המסכים.
 */
import { useEffect, useSyncExternalStore } from "react";
import modelFile from "../data/model.json";
import { liveDashboard, newerDashboard, siteDashboard, type Dashboard } from "./crowdApi";
import { OUTBOX_EVENT, SAVED_EVENT } from "./outbox";

interface ModelCentral { asof: string; polls: number; central: { seats: Record<string, number>; shares: Record<string, number> } }
const model = modelFile as unknown as ModelCentral;

/** ממוצע הסקרים: מנדטים ואחוזים לכל רשימה, התאריך ומספר הסקרים */
export const POLL_AVERAGE = {
  seats: model.central.seats,
  shares: model.central.shares,
  asOf: model.asof,
  polls: model.polls,
} as const;

// ---- ממוצע הגולשים: מאגר משותף

const LIVE_REFRESH_MS = 60_000;
type CrowdState = { dashboard: Dashboard | null; failed: boolean };
let state: CrowdState = { dashboard: null, failed: false };
const listeners = new Set<() => void>();
let users = 0;
let stop: (() => void) | null = null;
const emit = () => listeners.forEach((l) => l());
const show = (x: Dashboard) => { state = { dashboard: newerDashboard(state.dashboard, x), failed: false }; emit(); };

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

/** הסטטיסטיקות של הגולשים, מתעדכנות לבד. failed — גם העותק שבאתר וגם השרת לא זמינים. */
export function useCrowdDashboard(): CrowdState {
  useEffect(() => {
    if (users++ === 0) stop = start();
    return () => { if (--users === 0) { stop?.(); stop = null; } };
  }, []);
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}

/** ממוצע הגולשים לכל רשימה: מנדטים, ואחוזים (מכל ההשערות). null כשאין סטטיסטיקות. */
export function crowdAverage(d: Dashboard | null): { seats: Record<string, number> | null; pct: Record<string, number> | null; asOf: string | null } {
  const open = !!d?.open && !!d.seats?.n;
  return {
    seats: open && d!.seats!.full.length ? Object.fromEntries(d!.seats!.full.map((s) => [s.list, s.mean])) : null,
    pct: open && d!.seats!.pctStats?.length ? Object.fromEntries(d!.seats!.pctStats.map((s) => [s.list, s.mean])) : null,
    asOf: d?.publishedAt ?? null,
  };
}
export const useCrowdAverage = () => crowdAverage(useCrowdDashboard().dashboard);
