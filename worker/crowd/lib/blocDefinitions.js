import { GOV37, IDS_2026 } from "./lists.js";
export const COALITION = [...new Set([...GOV37, "amcha", "code_black", "haredi_public"])].sort();
export const ARAB = ["joint", "raam"];
export const OPPOSITION = [...IDS_2026].filter(id => !COALITION.includes(id) && !ARAB.includes(id)).sort();
export const UNITY = ["likud", "yashar", "together", "yb", "bluewhite", "reservists"];
export const FIXED_BLOCS = [
  { id: "government", name: "הממשלה היוצאת", lists: [...GOV37].sort() },
  { id: "coalition", name: "גוש הקואליציה", lists: COALITION },
  { id: "opposition", name: "גוש האופוזיציה", lists: OPPOSITION },
  { id: "arab", name: "ערבים", lists: ARAB },
  { id: "unity", name: "אחדות", lists: UNITY },
];
export const compositionKey = lists => [...new Set(lists)].sort().join(",");
const legacyCoalitions = [
  ["amcha", "likud", "otzma", "rzp", "shas", "utj"],
  COALITION.filter(id => id !== "haredi_public"),
];
const oldCoalitions = new Set(legacyCoalitions.map(compositionKey));
const oldOpposition = new Set(legacyCoalitions.flatMap(lists => {
  const rest = [...IDS_2026].filter(id => !lists.includes(id) && !ARAB.includes(id));
  return [compositionKey(rest), compositionKey(rest.filter(id => !["noam", "code_black"].includes(id)))];
}));
export function migrateBlocs(payload) {
  if (payload.mode !== "custom") return payload;
  let changed = false;
  let blocs = payload.blocs.map(b => {
    const key = compositionKey(b.lists);
    if (oldCoalitions.has(key)) { changed = true; return { ...b, lists: [...COALITION] }; }
    if (oldOpposition.has(key)) {
      changed = true; return { ...b, name: "גוש האופוזיציה", lists: [...OPPOSITION] };
    }
    return b;
  });
  if (!changed) return payload;
  if (blocs.length === 3 && ["gov", "rest", "arab"].every(id => blocs.some(b => b.id === id))) {
    const expected = { gov: COALITION, rest: OPPOSITION, arab: ARAB };
    if (blocs.every(b => compositionKey(b.lists) === compositionKey(expected[b.id]))) blocs = ["gov", "rest", "arab"].map(id => blocs.find(b => b.id === id));
  }
  return { ...payload, blocs };
}
/** סכומים נגזרים בלבד; המפלגות עצמן נשמרות בשלמותן לשחזור עתידי. */
export function fixedTotals(payload) {
  return Object.fromEntries(FIXED_BLOCS.map(b => [b.id, b.lists.reduce((sum, id) => sum + (payload.seats[id]?.v ?? 0), 0)]));
}

export function personalTotals(payload, definition) {
  const blocs = definition ? definition.mode === "gov37" ? definition.blocs.map(b => ({ ...b, lists: b.id === "gov" ? [...GOV37] : b.id === "rest" ? [...IDS_2026].filter(id => !GOV37.has(id)) : b.lists })) : migrateBlocs(definition).blocs : [
    {id:"gov",name:"גוש הקואליציה",lists:COALITION},
    {id:"rest",name:"גוש האופוזיציה",lists:OPPOSITION},
    {id:"arab",name:"ערבים",lists:ARAB},
    {id:"unity",name:"אחדות",lists:UNITY},
  ];
  return blocs.map(b => ({ id:b.id,name:b.name,lists:[...new Set(b.lists)],seats:[...new Set(b.lists)].reduce((sum,id)=>sum+(payload.seats[id]?.v??0),0) }));
}
