// מייצר את lib/lists.js מנתוני האתר (מקור אחד): רשימות 2026 עם סימון "ממשלה 37", רשימות 2022 (letters) ותוצאות 2022 הרשמיות,
// וממוצע הסקרים האחרון (model.json) להצגה בדשבורד. להריץ אחרי כל שינוי ברשימות: node worker/crowd/gen-lists.mjs
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../../src/data/", import.meta.url);
const meta = JSON.parse(readFileSync(new URL("meta.json", root), "utf8"));
const results = JSON.parse(readFileSync(new URL("results.json", root), "utf8"));
const model = JSON.parse(readFileSync(new URL("model.json", root), "utf8"));
const registry = JSON.parse(readFileSync(new URL("registry.json", root), "utf8"));
const k25 = results.find((e) => e.id === "k25");
const lists2026 = meta.lists2026.map((l) => ({ id: l.id, gov37: !!l.gov37 }));
const lists2022 = k25.lists.map((l) => l.letters);
const official2022 = Object.fromEntries(k25.lists.map((l) => [l.letters, Math.round((l.votes / k25.valid) * 10000) / 100]));
const out = `// נוצר אוטומטית מ-src/data על ידי worker/crowd/gen-lists.mjs — לא לערוך ביד.
export const REGISTRY = ${JSON.stringify(meta.dataAsOf)};
/** רשימות 2026: מזהה + האם בין מפלגות הממשלה היוצאת (ממשלה 37) */
export const LISTS_2026 = ${JSON.stringify(lists2026)};
/** רשימות 2022 (כנסת 25) לפי letters */
export const LISTS_2022 = ${JSON.stringify(lists2022)};
/** אחוז מהקולות הכשרים בבחירות 2022 — התוצאה הרשמית */
export const OFFICIAL_2022 = ${JSON.stringify(official2022)};
/** ממוצע הסקרים (מנדטים) מתמונת המודל האחרונה */
export const POLLS = ${JSON.stringify(model.central.seats)};
export const POLLS_AS_OF = ${JSON.stringify(model.asof)};
/** ממוצע הסקרים (אחוזים) — לאחוז של רשימה עם 0 מנדטים כשהשערה נשמרה בלי אחוזים */
export const POLL_SHARES = ${JSON.stringify(model.central.shares)};
/** ברירות המחדל של החישוב באתר (src/pages/guess/pctSync.ts): בעלי זכות, הסכמי עודפים */
export const ELIGIBLE = ${JSON.stringify(registry.k26.eligible)};
export const AGREEMENTS = ${JSON.stringify(meta.agreements2026.map((a) => a.pair))};
export const IDS_2026 = new Set(LISTS_2026.map((l) => l.id));
export const IDS_2022 = new Set(LISTS_2022);
export const GOV37 = new Set(LISTS_2026.filter((l) => l.gov37).map((l) => l.id));
`;
writeFileSync(new URL("lib/lists.js", import.meta.url), out);
console.log("lib/lists.js:", lists2026.length, "רשימות 2026,", lists2022.length, "רשימות 2022");
