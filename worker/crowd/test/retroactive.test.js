import { expect, it } from 'vitest';
import { upgradeVersion, upgradeAggregate } from '../lib/retroactive.js';
import { fixedTotals, migrateBlocs, COALITION, OPPOSITION } from '../lib/blocDefinitions.js';
import { computeBlocs } from '../lib/aggregate.js';

const payload = { seats: Object.fromEntries(Object.entries({likud:40,shas:8,utj:8,otzma:4,rzp:4,noam:4,amcha:4,code_black:4,haredi_public:4,joint:8,raam:4,yashar:28}).map(([id,v]) => [id,{v,src:'manual',locked:false}])), start:'zero',pollsAsOf:null };
it('משחזר שלושה הרכבים נפרדים בכל גרסה ושומר את חלוקת המקור', () => {
  expect(fixedTotals(payload)).toEqual({government:68,coalition:80,opposition:28,arab:12,unity:68});
  const result = upgradeVersion({id:1,unit:'seats',payload});
  expect(result.seats).toEqual(payload.seats);
  expect(upgradeVersion({id:1,unit:'seats',payload:result})).toEqual(result);
  expect(() => upgradeVersion({id:2,unit:'seats',payload:{seats:{likud:{v:90}}}})).toThrow();
});
it('משדרג ברירות מחדל ישנות, בלי לשנות גוש אישי או הימור ישיר', () => {
  const p = { mode:'custom',blocs:[{id:'gov',name:'גוש הקואליציה',lists:COALITION.filter(id => id!=='haredi_public'),target:60},{id:'arab',name:'ערבים',lists:['joint','raam'],target:null},{id:'rest',name:'כל השאר',lists:[...OPPOSITION,'haredi_public'],target:45}] };
  const result = migrateBlocs(p);
  expect(result.blocs.map(b=>b.id)).toEqual(['gov','rest','arab']);
  expect(result.blocs[0].lists).toEqual(COALITION);
  expect(result.blocs[0].target).toBe(60);
  expect(result.blocs[1].lists).toEqual(OPPOSITION);
  expect(migrateBlocs(result)).toBe(result);
  const custom = {mode:'custom',blocs:[{id:'x',name:'אישי',lists:['likud','haredi_public'],target:50}]};
  expect(migrateBlocs(custom)).toBe(custom);
});
it('ארבע שורות קבועות מחושבות לכל בעלי השערת מפלגות גם בלי הגדרת גושים', () => {
  const b = computeBlocs([{participant:'a',payload},{participant:'b',payload}],[]);
  expect(b.fixed.map(g => [g.name,g.stat.mean,g.stat.n])).toEqual([['הממשלה היוצאת',68,2],['גוש הקואליציה',80,2],['גוש האופוזיציה',28,2],['ערבים',12,2],['אחדות',68,2]]);
});
it('פרסום היסטורי משתמש בגרסאות המקור ולא בהשערה מאוחרת', () => {
  const versions = [{id:1,participant:'a',unit:'seats',created_at:'2026-10-01',payload},{id:2,participant:'a',unit:'seats',created_at:'2026-10-03',payload:{...payload,seats:{likud:{v:120}}}}];
  const row = {section:'blocs',snapshot:'[1]',json:'{}',published_at:'2026-10-02'};
  expect(JSON.parse(upgradeAggregate(row,versions,[])).fixed[1].stat.mean).toBe(80);
});

it('שומר סכום והרכב אישי בכל גרסה ומשחזר לפי ההגדרה באותה עת', () => {
  const definition = {mode:'custom',blocs:[{id:'a',name:'אישי',lists:['likud','joint'],target:50}]};
  const result=upgradeVersion({id:1,unit:'seats',payload},definition);
  expect(result.personalBlocSeats).toEqual([{id:'a',name:'אישי',lists:['likud','joint'],seats:48}]);
  expect(upgradeVersion({id:1,unit:'seats',payload:result},null).personalBlocSeats).toEqual(result.personalBlocSeats);
});
