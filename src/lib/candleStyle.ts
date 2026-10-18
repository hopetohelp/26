import { useSyncExternalStore } from "react";
export type CandleStyle = "uniform" | "profile";
const KEY = "elections26.candleStyle";
const EVENT = "candle-style-change";
let memory: CandleStyle = "uniform";
const read = (): CandleStyle => {
  try { return localStorage.getItem(KEY) === "profile" ? "profile" : "uniform"; } catch { return memory; }
};
const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener("storage", notify); };
};
export const useCandleStyle = () => useSyncExternalStore(subscribe, read, () => "uniform" as CandleStyle);
export function setCandleStyle(style: CandleStyle) {
  memory = style;
  try { localStorage.setItem(KEY, style); } catch { /* העדפה לביקור הנוכחי */ }
  window.dispatchEvent(new Event(EVENT));
}
