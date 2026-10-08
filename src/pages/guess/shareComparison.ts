import forecastFile from "../../data/forecast.json";
import { POLLS, POLLS_AS_OF } from "./model";
import { blocValues } from "../../lib/personalBlocs";
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
  return blocs.filter(b => b.lists.length).map(b => {
    const members = [{id: "share", name:b.name, lists:b.lists, target:null}];
    const mapping=Object.fromEntries(b.lists.map(id=>[id,id]));
    const mineInfo=blocValues(members,values,mapping)[0];
    const pollsInfo=blocValues(members,polls,mapping)[0];
    const forecastInfo=blocValues(members,forecast??{},mapping)[0];
    return {...b,mine:mineInfo.total,polls:pollsInfo.total,forecast:forecastInfo.total,mineInfo,pollsInfo,forecastInfo};
  }).sort((a,b)=>(b.mine??b.mineInfo.knownTotal??-1)-(a.mine??a.mineInfo.knownTotal??-1));
}
