import { mean, pollsterKey, pollsterLabel, seatsIn, toTime, type Poll } from "./data";
import { blocValues, type BlocImputation, type BlocRow } from "./personalBlocs";
import type { Bloc } from "./crowdApi";
import policy from "./blocEstimatePolicy.json";
const DAY = 86400000;
export interface EstimatePolicy { maxAgeDays: number; allowedIds: string[]; maxMissingFraction: number; maxEstimatedSeatFraction: number }
export const BLOC_ESTIMATE_POLICY: EstimatePolicy = policy;

/** תאריך פרסום שמרני: מקור מסיום אותו יום לא משלים סקר שהתחיל בו. */
function availableBefore(p: Poll, target: Poll): boolean {
  const reported = Date.parse(p.assumedPublishedAt ?? "");
  const detail = p.verification?.details.published?.replace(/\s*\(([+-]\d{2}:\d{2})\)$/, "$1").replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  const verified = Date.parse(detail && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(detail) ? `${detail}+03:00` : detail ?? "");
  const latest = Math.max(Number.isFinite(reported) ? reported : toTime(p.end) + DAY / 2 - 1, Number.isFinite(verified) ? verified : 0);
  // +03:00 הוא תחילת היום המוקדמת ביותר בישראל, גם בחורף: שמרני בהיעדר שעת התחלה.
  const start = target.start || target.end;
  return p.end < start && latest < Date.parse(`${start}T00:00:00+03:00`);
}
export function estimatePollParty(target: Poll, id: string, source: Poll[], maxAgeDays: number): BlocImputation | null {
  const previous = source.filter(p => p.id !== target.id && p.eligibleToShow && p.consistent && p.verification?.status !== "mismatch" && availableBefore(p, target) && toTime(target.end) - toTime(p.end) <= maxAgeDays * DAY && Number.isFinite(seatsIn(p,id)))
    .sort((a,b) => b.end.localeCompare(a.end) || a.id.localeCompare(b.id));
  const same = previous.find(p => pollsterKey(p) === pollsterKey(target));
  const selected: Poll[] = same ? [same] : [...new Map(previous.slice().reverse().map(p=>[p.firm,p])).values()];
  if (!same && selected.length < 3) return null;
  const value = same ? seatsIn(same,id)! : mean(selected.map(p=>seatsIn(p,id)!));
  return { id, value, method: same ? "same-firm" : "mean", sources: selected.map(p=>({id:p.id,date:p.end,label:pollsterLabel(p)})) };
}
export function pollBlocValues(blocs: Bloc[], target: Poll, source: Poll[], rules: EstimatePolicy = BLOC_ESTIMATE_POLICY): BlocRow[] {
  const ids = [...new Set(blocs.flatMap(b=>b.lists))];
  const values = Object.fromEntries(ids.map(id=>[id,seatsIn(target,id)]));
  const rows = blocValues(blocs,values,Object.fromEntries(ids.map(id=>[id,id])));
  if (!target.eligibleToShow || !target.consistent || target.verification?.status === "mismatch") return rows;
  const knownPollTotal = Object.keys(target.values).reduce((n,id)=>n+(seatsIn(target,id) ?? 0),0);
  const completions = new Map(ids.filter(id=>values[id] === undefined && rules.allowedIds.includes(id)).map(id=>[id,estimatePollParty(target,id,source,rules.maxAgeDays)]));
  const sumEstimates = [...completions.values()].reduce((n,c)=>n+(c?.value ?? 0),0);
  const consistent = knownPollTotal + sumEstimates <= 120;
  return rows.map(row=>{
    if (!row.missing.length || row.knownTotal === null) return row;
    if (row.missing.length / row.lists.length > rules.maxMissingFraction) return {...row,reason:"חלק גדול מדי מההרכב חסר"};
    const imputed = row.missing.map(id=>completions.get(id));
    if (imputed.some(x=>!x)) return {...row,reason:"אין מקור קודם קרוב שעבר את בדיקת הדיוק"};
    if (knownPollTotal > 120 || (!consistent && imputed.some(c=>c!.value>0))) return {...row,reason:"ההשלמה אינה עקבית עם סכום המנדטים בסקר"};
    const complete = imputed as BlocImputation[];
    const added = complete.reduce((n,c)=>n+c.value,0), estimate = row.knownTotal + added;
    if (estimate > 120 || (estimate > 0 && added / estimate > rules.maxEstimatedSeatFraction)) return {...row,reason:"ההשלמה גדולה מדי ביחס לנתון הידוע"};
    return {...row,estimate,imputed:complete};
  });
}

export function rollingBlocMean(blocs: Bloc[], source: Poll[], donors: Poll[], from: string, to: string, days: number, minN: number, step = 3, rules = BLOC_ESTIMATE_POLICY) {
  const projected = source.map(p=>({t:toTime(p.end),rows:pollBlocValues(blocs,p,donors,rules)}));
  return blocs.map(b=>{
    const points: {t:number;v:number;lo:number;hi:number;xs:number[];n:number;fullN:number;estimatedN:number;missingN:number;estimated:boolean;missing:string[];imputed:BlocImputation[];breakBefore:boolean}[]=[];
    for(let t=toTime(from);t<=toTime(to);t+=step*DAY){
      const rows=projected.filter(p=>p.t<=t && p.t>t-days*DAY).map(p=>p.rows.find(r=>r.id===b.id)!);
      const ready=rows.filter(r=>r.total!==null || r.estimate!==null);
      if(ready.length<minN)continue;
      const estimatedRows=ready.filter(r=>r.estimate!==null);
      const totals=ready.map(r=>r.total??r.estimate!);
      points.push({t,v:mean(totals),lo:Math.min(...totals),hi:Math.max(...totals),xs:totals,n:ready.length,fullN:ready.length-estimatedRows.length,estimatedN:estimatedRows.length,missingN:rows.length-ready.length,estimated:!!estimatedRows.length,missing:[...new Set(estimatedRows.flatMap(r=>r.missing))],imputed:estimatedRows.flatMap(r=>r.imputed),breakBefore:!!points.length && t-points[points.length-1].t>step*DAY});
    }
    return {id:b.id,name:b.name,points};
  });
}
