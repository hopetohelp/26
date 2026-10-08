// נוצר אוטומטית מ-src/data על ידי worker/crowd/gen-lists.mjs — לא לערוך ביד.
export const REGISTRY = "2026-10-08T16:12:37+03:00";
/** רשימות 2026: מזהה + האם בין מפלגות הממשלה היוצאת (ממשלה 37) */
export const LISTS_2026 = [{"id":"likud","gov37":true},{"id":"yashar","gov37":false},{"id":"together","gov37":false},{"id":"democrats","gov37":false},{"id":"yb","gov37":false},{"id":"shas","gov37":true},{"id":"utj","gov37":true},{"id":"otzma","gov37":true},{"id":"rzp","gov37":true},{"id":"joint","gov37":false},{"id":"raam","gov37":false},{"id":"reservists","gov37":false},{"id":"bluewhite","gov37":false},{"id":"amcha","gov37":false},{"id":"haredi_public","gov37":false},{"id":"noam","gov37":false},{"id":"code_black","gov37":false}];
/** רשימות 2022 (כנסת 25) לפי letters */
export const LISTS_2022 = ["מחל","פה","ט","כן","שס","ג","ל","עם","ום","אמת","מרצ","ד","ב","אצ","קץ","יז","צ","ף","ק","ת","ני","קנ","נק","י","קך","נץ","ץ","רז","ך","ז","קי","יק","נז","נר","זץ","יץ","נף","ינ","זך","זנ"];
/** אחוז מהקולות הכשרים בבחירות 2022 — התוצאה הרשמית */
export const OFFICIAL_2022 = {"מחל":23.41,"פה":17.79,"ט":10.84,"כן":9.08,"שס":8.25,"ג":5.88,"ל":4.48,"עם":4.07,"ום":3.75,"אמת":3.69,"מרצ":3.16,"ד":2.91,"ב":1.19,"אצ":0.33,"קץ":0.31,"יז":0.29,"צ":0.18,"ף":0.04,"ק":0.03,"ת":0.03,"ני":0.03,"קנ":0.03,"נק":0.03,"י":0.02,"קך":0.02,"נץ":0.02,"ץ":0.02,"רז":0.02,"ך":0.02,"ז":0.01,"קי":0.01,"יק":0.01,"נז":0.01,"נר":0.01,"זץ":0.01,"יץ":0.01,"נף":0.01,"ינ":0,"זך":0,"זנ":0};
/** ממוצע הסקרים (מנדטים) מתמונת המודל האחרונה */
export const POLLS = {"amcha":4,"bluewhite":0,"democrats":9,"haredi_public":0,"joint":8,"likud":22,"otzma":8,"raam":5,"reservists":0,"rzp":6,"shas":8,"together":11,"utj":8,"yashar":23,"yb":8};
export const POLLS_AS_OF = "2026-10-07";
export const IDS_2026 = new Set(LISTS_2026.map((l) => l.id));
export const IDS_2022 = new Set(LISTS_2022);
export const GOV37 = new Set(LISTS_2026.filter((l) => l.gov37).map((l) => l.id));
