import { expect, it } from "vitest";
import { estimatePollParty, pollBlocValues, rollingBlocMedian, type EstimatePolicy } from "./blocEstimates";
import { blocValues, formatBlocValue, historicalBlocValues } from "./personalBlocs";
import { seatsIn, type Poll } from "./data";
const rules:EstimatePolicy={maxAgeDays:7,allowedIds:['x','y','z'],maxMissingFraction:.5,maxEstimatedSeatFraction:1/3};
const bloc={id:'b',name:'בדיקה',lists:['x','y'],target:61};
const p=(id:string,end:string,values:Poll['values'],firm='A'):Poll=>({id,assumedPublishedAt:`${end}T20:00:00+03:00`,start:end,end,firm,firmHe:firm,publisher:null,publisherHe:null,sample:null,values,gov:null,consistent:true,eligibleToShow:true,urls:[],verified:true,source:{page:'fixture',tableLine:1}});
const previous=p('previous','2026-01-01',{x:{s:20},y:{s:4},other:{s:96}});
const target=p('target','2026-01-04',{x:{s:20},other:{s:96}});
it('סכום מקור, סכום חלקי ואומדן נשמרים בנפרד בלי לשנות מקור, יעד או אפס',()=>{
 const before=JSON.stringify(target);
 const row=pollBlocValues([bloc],target,[previous],rules)[0];
 expect(row.total).toBeNull();expect(row.knownTotal).toBe(20);expect(row.estimate).toBe(24);expect(row.target).toBe(61);
 expect(formatBlocValue(row)).toBe('כ-24');expect(row.knownCount).toBe(1);expect(row.missing).toEqual(['y']);
 expect(row.imputed[0].sources[0].id).toBe('previous');expect(JSON.stringify(target)).toBe(before);
 const full=pollBlocValues([bloc],{...target,values:{...target.values,y:{p:2.1}}},[previous],rules)[0];
 expect(full.total).toBe(20);expect(full.estimate).toBeNull();expect(formatBlocValue(full)).toBe('20');
});
it('אין מידע עתידי או סקר מאותו יום, גם אם הוא מגיע ראשון במערך',()=>{
 const future=p('future','2026-01-06',{y:{s:12}}),sameDay=p('same','2026-01-04',{y:{s:11}});
 expect(estimatePollParty(target,'y',[future,sameDay,previous],7)?.value).toBe(4);
 expect(estimatePollParty(target,'y',[future,sameDay],7)).toBeNull();
 expect(estimatePollParty(target,'y',[{...previous,assumedPublishedAt:'2026-01-05T20:00:00Z'}],7)).toBeNull();
 expect(estimatePollParty({...target,start:'2026-01-01'},'y',[previous],7)).toBeNull();
 expect(estimatePollParty(target,'y',[{...previous,end:'2026-01-03',assumedPublishedAt:'2026-01-04T01:00:00+03:00'}],7)).toBeNull();
 expect(estimatePollParty(target,'y',[{...previous,end:'2026-01-03',assumedPublishedAt:'2026-01-03T20:00:00+03:00',verification:{status:'match',source:null,checkedAt:'2026-01-04',details:{published:'2026-01-04T01:00:00+03:00'}}}],7)).toBeNull();
});
it('מקור ישן, מקור שלא הותר לפרסום ומפלגה שלא עברה אימות אינם משמשים השלמה',()=>{
 expect(estimatePollParty({...target,end:'2026-01-15',start:'2026-01-15'},'y',[previous],7)).toBeNull();
 expect(estimatePollParty(target,'y',[{...previous,eligibleToShow:false}],7)).toBeNull();
 expect(pollBlocValues([bloc],target,[previous],{...rules,allowedIds:[]})[0].estimate).toBeNull();
 expect(pollBlocValues([bloc],{...target,consistent:false},[previous],rules)[0].estimate).toBeNull();
});
it('מקור חלופי דורש שלושה מכונים עצמאיים, עם סקר אחרון אחד למכון',()=>{
 const a=p('a','2026-01-01',{y:{s:4}},'B'),b=p('b','2026-01-02',{y:{s:6}},'C'),c=p('c','2026-01-03',{y:{s:8}},'D');
 expect(estimatePollParty(target,'y',[a,b,c],7)?.value).toBe(6);
 expect(estimatePollParty(target,'y',[a,b],7)).toBeNull();
 expect(estimatePollParty(target,'y',[a,{...b,firm:'B'},{...c,firm:'B'}],7)).toBeNull();
});
it('כיסוי נמוך או השלמה שסותרת 120 חוזרים לסכום החלקי',()=>{
 const over={...target,values:{x:{s:20},other:{s:100}}};
 const row=pollBlocValues([bloc],over,[previous],rules)[0];expect(row.estimate).toBeNull();expect(formatBlocValue(row)).toBe('לפחות 20');
 expect(pollBlocValues([{...bloc,lists:['x','y','z']}],target,[previous],rules)[0].estimate).toBeNull();
 expect(pollBlocValues([bloc],{...target,values:{x:{s:2}}},[previous],rules)[0].estimate).toBeNull();
 expect(pollBlocValues([bloc],{...target,values:{}},[previous],rules)[0].knownTotal).toBeNull();
});
it('השלמות בין גושים חופפים נשארות עקביות עם סכום הסקר',()=>{
 const source={...previous,values:{y:{s:6},z:{s:6}}};
 const rows=pollBlocValues([bloc,{...bloc,id:'other',lists:['x','z']}],{...target,values:{x:{s:50},other:{s:60}}},[source],rules);
 expect(rows.every(r=>r.estimate===null)).toBe(true);
 const overlap=pollBlocValues([bloc,{...bloc,id:'other'}],target,[previous],rules);
 expect(overlap.map(r=>r.estimate)).toEqual([24,24]);
});
it('פיצול היסטורי נשאר חלקי; רשימת עבר משותפת נספרת פעם אחת',()=>{
 const rows=historicalBlocValues([{...bloc,lists:['x','new']}],[{k26:['x'],k25:['old']},{k26:['new','second'],k25:['shared']}],{old:42,shared:18});
 expect(rows[0].knownTotal).toBe(42);expect(rows[0].total).toBeNull();expect(formatBlocValue(rows[0])).toBe('לפחות 42');
 expect(blocValues([{...bloc,lists:['x','y']}],{old:42},{x:'old',y:'old'})[0].total).toBe(42);
});
it('מגמה מחשבת חציון אחרי סכימה בכל סקר, לא סכום חציוני מפלגות',()=>{
 const polls=[p('a','2026-01-01',{x:{s:1},y:{s:9}}),p('b','2026-01-02',{x:{s:9},y:{s:1}}),p('c','2026-01-03',{x:{s:9},y:{s:9}})];
 const point=rollingBlocMedian([bloc],polls,polls,'2026-01-03','2026-01-03',14,3,3,rules)[0].points[0];
 expect(point.v).toBe(10);expect(point.fullN).toBe(3);expect(point.estimatedN).toBe(0);
});
it('מגמה מציינת את הסקרים שהושלמו ומפרידה סקרים חלקיים מהחציון',()=>{
 const full=p('full','2026-01-02',{x:{s:21},y:{s:4},other:{s:95}});
 const incomplete=p('missing','2026-01-03',{x:{s:20},z:{s:5},other:{s:95}});
 const point=rollingBlocMedian([bloc],[full,target,incomplete],[previous],'2026-01-04','2026-01-04',14,2,3,rules)[0].points[0];
 expect(point.estimated).toBe(true);expect(point.fullN).toBe(1);expect(point.estimatedN).toBe(1);expect(point.missingN).toBe(1);expect(point.v).toBe(24.5);expect(point.missing).toEqual(['y']);
});
it('חסר אינו אפס, ואחוז שאינו מתחת לסף אינו ראיה לאפס מנדטים',()=>{
 expect(seatsIn(p('a','2026-01-01',{}),'x')).toBeUndefined();
 expect(seatsIn(p('a','2026-01-01',{x:{p:3.5}}),'x')).toBeUndefined();
 expect(seatsIn(p('a','2026-01-01',{x:{p:2}}),'x')).toBe(0);
});

it('השלמת אפס אינה נחסמת בגלל מועמד חיובי שנדחה בגוש אחר',()=>{
 const source={...previous,values:{y:{s:0},z:{s:4}}};
 const rows=pollBlocValues([bloc,{...bloc,id:'other',lists:['x','z']}],{...target,values:{x:{s:20},other:{s:100}}},[source],rules);
 expect(rows[0].estimate).toBe(20);expect(rows[0].total).toBeNull();expect(rows[1].estimate).toBeNull();
});
