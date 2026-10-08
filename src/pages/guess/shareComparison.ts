import forecastFile from "../../data/forecast.json";
import { POLLS, POLLS_AS_OF } from "./model";
import type { BlocTotal } from "./blocSummary";

const forecast = forecastFile as { asof: string; enough: boolean; lists: Record<string, { seats: number }> ; gate: { passedAtHorizon: boolean | null } };
export const SHARE_POLLS = POLLS;
export const SHARE_POLLS_AS_OF = POLLS_AS_OF;
export const SHARE_FORECAST = forecast.enough ? Object.fromEntries(Object.entries(forecast.lists).map(([id, row]) => [id, row.seats])) : null;
export const SHARE_FORECAST_AS_OF = forecast.asof;
export const SHARE_FORECAST_CAUTION = !forecast.gate.passedAtHorizon;

/** חסר נתון אפילו למפלגה אחת ⇐ אין סכום מלא; גושים חופפים נשארים שורות עצמאיות. */
export function sumShareBloc(lists: string[], values: Record<string, number> | null): number | null {
  if (!values || !lists.length || lists.some(id => !Number.isFinite(values[id]))) return null;
  return [...new Set(lists)].reduce((n, id) => n + values[id], 0);
}
export function shareBlocRows(blocs: BlocTotal[], values: Record<string, number>, polls = SHARE_POLLS, forecast: Record<string, number> | null = SHARE_FORECAST) {
  return blocs.filter(b => b.lists.length).map(b => ({ ...b,
    mine: sumShareBloc(b.lists, values), polls: sumShareBloc(b.lists, polls), forecast: sumShareBloc(b.lists, forecast),
  })).sort((a, b) => (b.mine ?? -1) - (a.mine ?? -1));
}
