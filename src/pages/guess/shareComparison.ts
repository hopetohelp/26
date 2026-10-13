import { resolveDataset, resolveData, type Selection } from "../../lib/dataResolver";
import forecastFile from "../../data/forecast.json";
import { POLLS_AS_OF } from "./model";
import { blocValues } from "../../lib/personalBlocs";
import { sumPresent } from "../../lib/data";
import type { BlocTotal } from "./blocSummary";

const forecast = forecastFile as { asof: string; enough: boolean; lists: Record<string, { seats: number }> ; gate: { passedAtHorizon: boolean | null } };
export const SHARE_POLLS = resolveDataset({ product: "polls.mean" }, "guess").seats;
export const SHARE_POLLS_AS_OF = POLLS_AS_OF;
export const SHARE_FORECAST = forecast.enough ? Object.fromEntries(Object.entries(forecast.lists).map(([id, row]) => [id, row.seats])) : null;
export const SHARE_FORECAST_AS_OF = forecast.asof;
export const SHARE_FORECAST_CAUTION = !forecast.gate.passedAtHorizon;

/** סכום גוש לפי הכלל האחד (`sumPresent`): מפלגה בלי נתון נספרת 0; בלי נתון לאף מפלגה — null. גושים חופפים נשארים שורות עצמאיות. */
export function sumShareBloc(lists: string[], values: Record<string, number> | null): number | null {
  if (!values) return null;
  return sumPresent([...new Set(lists)].map(id => Number.isFinite(values[id]) ? values[id] : undefined));
}
export function shareBlocRows(blocs: BlocTotal[], values: Record<string, number>, polls = SHARE_POLLS, forecast: Record<string, number> | null = SHARE_FORECAST, selection?: Selection) {
  return blocs.filter(b => b.lists.length).map(b => {
    const members = [{id: "share", name:b.name, lists:b.lists, target:null}];
    const mapping=Object.fromEntries(b.lists.map(id=>[id,id]));
    const mineInfo=blocValues(members,values,mapping)[0];
    const pollsInfo=selection ? { ...members[0], total: resolveData(selection, b.lists, "guess").value } : blocValues(members,polls,mapping)[0];
    const forecastInfo=blocValues(members,forecast??{},mapping)[0];
    return {...b,mine:mineInfo.total,polls:pollsInfo.total,forecast:forecastInfo.total,mineInfo,pollsInfo,forecastInfo};
  }).sort((a,b)=>(b.mine??-1)-(a.mine??-1));
}
