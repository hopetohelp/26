import { CLOSED_LISTS, GOV37, IDS_2026, LISTS_2026 } from "./lists.js";
export const COALITION = [...new Set([...GOV37, "amcha", "code_black", "haredi_public"])].sort();
export const ARAB = ["joint", "raam"];
export const OPPOSITION = [...IDS_2026].filter(id => !COALITION.includes(id) && !ARAB.includes(id)).sort();
export const UNITY = ["likud", "yashar", "together", "yb", "bluewhite", "reservists"];
export const FIXED_BLOCS = [
  { id: "government", name: "הממשלה היוצאת", lists: [...GOV37].sort() },
  { id: "coalition", name: "גוש נתניהו", lists: COALITION },
  { id: "opposition", name: "גוש אייזנקוט", lists: OPPOSITION },
  { id: "unity", name: "אחדות", lists: UNITY },
  { id: "arab", name: "מפלגות ערביות", lists: ARAB },
];
/**
 * חמש הקבוצות של חלוקת הכנסת באתר (הכרעת בעלים 25.10.2026) — אותה הגדרה כמו KNESSET_GROUPS ב-src/lib/simpleSources.ts
 * (בדיקה מוודאת שהן זהות): נתניהו · חרדים · ערבים · אייזנקוט · אחדות, בלי רשימות שלא עברו באף סקר. האחדות חופפת לנתניהו ולאייזנקוט.
 */
const OPEN = LISTS_2026.filter(l => !l.withdrawn).map(l => l.id).filter(id => !CLOSED_LISTS.includes(id));
const open = ids => ids.filter(id => OPEN.includes(id));
const K_NET = open(["likud", "otzma", "rzp", "amcha", "noam"]), K_HAREDI = open(["shas", "utj", "code_black", "haredi_public"]), K_ARAB = open(["joint", "raam"]);
const K_EIS = OPEN.filter(id => ![...K_NET, ...K_HAREDI, ...K_ARAB].includes(id));
export const KNESSET_BLOCS = [
  { id: "k-netanyahu", name: "נתניהו", lists: K_NET },
  { id: "k-haredi", name: "חרדים", lists: K_HAREDI },
  { id: "k-arab", name: "ערבים", lists: K_ARAB },
  { id: "k-eisenkot", name: "אייזנקוט", lists: K_EIS },
  { id: "k-unity", name: "אחדות", lists: OPEN.filter(id => ![...K_HAREDI, ...K_ARAB, "otzma", "rzp", "democrats"].includes(id)) },
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
/** שמות ברירת המחדל הישנים של שני הגושים (הכרעת בעלים 11.10.2026); משנים רק גוש שהרכבו כברירת המחדל */
const RENAMED = { gov: [["גוש הקואליציה"], "גוש נתניהו", COALITION], rest: [["גוש האופוזיציה", "גוש איזנקוט"], "גוש אייזנקוט", OPPOSITION] };
function renameDefaults(payload) {
  if (payload.mode !== "custom") return payload;
  let changed = false;
  const blocs = payload.blocs.map(b => {
    const r = RENAMED[b.id];
    if (!r || !r[0].includes(b.name) || compositionKey(b.lists) !== compositionKey(r[2])) return b;
    changed = true;
    return { ...b, name: r[1] };
  });
  return changed ? { ...payload, blocs } : payload;
}
export function migrateBlocs(payload) {
  if (payload.mode !== "custom") return payload;
  if (payload.schemaVersion === 2) return renameDefaults(payload);
  let changed = false;
  let blocs = payload.blocs.map(b => {
    const key = compositionKey(b.lists);
    if (oldCoalitions.has(key) && ["גוש נתניהו", "גוש הקואליציה", "קואליציה", "גוש א"].includes(b.name)) { changed = true; return { ...b, lists: [...COALITION] }; }
    if (oldOpposition.has(key) && ["כל השאר", "גוש אייזנקוט", "גוש איזנקוט", "גוש האופוזיציה", "גוש ב"].includes(b.name)) {
      changed = true; return { ...b, name: "גוש אייזנקוט", lists: [...OPPOSITION] };
    }
    return b;
  });
  if (!changed) return payload;
  if (blocs.length === 3 && ["gov", "rest", "arab"].every(id => blocs.some(b => b.id === id))) {
    const expected = { gov: COALITION, rest: OPPOSITION, arab: ARAB };
    if (blocs.every(b => compositionKey(b.lists) === compositionKey(expected[b.id]))) blocs = ["gov", "rest", "arab"].map(id => blocs.find(b => b.id === id));
  }
  return renameDefaults({ ...payload, blocs });
}
/** סכומים נגזרים בלבד; המפלגות עצמן נשמרות בשלמותן לשחזור עתידי. */
export function fixedTotals(payload) {
  return Object.fromEntries(FIXED_BLOCS.map(b => [b.id, b.lists.reduce((sum, id) => sum + (payload.seats[id]?.v ?? 0), 0)]));
}

export function personalTotals(payload, definition) {
  const blocs = definition ? definition.mode === "gov37" ? definition.blocs.map(b => ({ ...b, lists: b.id === "gov" ? [...GOV37] : b.id === "rest" ? [...IDS_2026].filter(id => !GOV37.has(id)) : b.lists })) : migrateBlocs(definition).blocs : [
    {id:"government",name:"הממשלה היוצאת",lists:[...GOV37]},
    {id:"gov",name:"גוש נתניהו",lists:COALITION},
    {id:"rest",name:"גוש אייזנקוט",lists:OPPOSITION},
    {id:"unity",name:"אחדות",lists:UNITY},
    {id:"arab",name:"מפלגות ערביות",lists:ARAB},
  ];
  return blocs.map(b => ({ id:b.id,name:b.name,lists:[...new Set(b.lists)],seats:[...new Set(b.lists)].reduce((sum,id)=>sum+(payload.seats[id]?.v??0),0) }));
}

