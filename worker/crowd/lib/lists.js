// נוצר אוטומטית מ-src/data על ידי worker/crowd/gen-lists.mjs — לא לערוך ביד.
export const REGISTRY = "2026-10-11T17:05:25+03:00";
/** רשימות 2026: מזהה + האם בין מפלגות הממשלה היוצאת (ממשלה 37) */
export const LISTS_2026 = [{"id":"likud","gov37":true},{"id":"yashar","gov37":false},{"id":"together","gov37":false},{"id":"democrats","gov37":false},{"id":"yb","gov37":false},{"id":"shas","gov37":true},{"id":"utj","gov37":true},{"id":"otzma","gov37":true},{"id":"rzp","gov37":true},{"id":"joint","gov37":false},{"id":"raam","gov37":false},{"id":"reservists","gov37":false},{"id":"bluewhite","gov37":false},{"id":"amcha","gov37":false},{"id":"haredi_public","gov37":false},{"id":"noam","gov37":true},{"id":"code_black","gov37":false}];
/** רשימות 2022 (כנסת 25) לפי letters */
export const LISTS_2022 = ["מחל","פה","ט","כן","שס","ג","ל","עם","ום","אמת","מרצ","ד","ב","אצ","קץ","יז","צ","ף","ק","ת","ני","קנ","נק","י","קך","נץ","ץ","רז","ך","ז","קי","יק","נז","נר","זץ","יץ","נף","ינ","זך","זנ"];
/** אחוז מהקולות הכשרים בבחירות 2022 — התוצאה הרשמית */
export const OFFICIAL_2022 = {"מחל":23.41,"פה":17.79,"ט":10.84,"כן":9.08,"שס":8.25,"ג":5.88,"ל":4.48,"עם":4.07,"ום":3.75,"אמת":3.69,"מרצ":3.16,"ד":2.91,"ב":1.19,"אצ":0.33,"קץ":0.31,"יז":0.29,"צ":0.18,"ף":0.04,"ק":0.03,"ת":0.03,"ני":0.03,"קנ":0.03,"נק":0.03,"י":0.02,"קך":0.02,"נץ":0.02,"ץ":0.02,"רז":0.02,"ך":0.02,"ז":0.01,"קי":0.01,"יק":0.01,"נז":0.01,"נר":0.01,"זץ":0.01,"יץ":0.01,"נף":0.01,"ינ":0,"זך":0,"זנ":0};
/** ממוצע הסקרים (מנדטים) מתמונת המודל האחרונה */
export const POLLS = {"amcha":0,"bluewhite":0,"democrats":9,"haredi_public":0,"joint":8,"likud":23,"otzma":8,"raam":6,"reservists":0,"rzp":6,"shas":8,"together":12,"utj":8,"yashar":23,"yb":9};
export const POLLS_AS_OF = "2026-10-11";
/** טווח הסקרים (הנמוך והגבוה בין המכונים) — גיבוי לבדיקת השערות חריגות כשאין חיבור לקובץ שבאתר (public/poll-ranges.json) */
export const POLL_RANGES = {"likud":{"lo":20,"hi":31},"yashar":{"lo":20,"hi":24},"together":{"lo":8,"hi":14},"democrats":{"lo":8,"hi":10},"yb":{"lo":5,"hi":10},"shas":{"lo":7,"hi":10},"utj":{"lo":7,"hi":8},"otzma":{"lo":6,"hi":9},"rzp":{"lo":5,"hi":7},"joint":{"lo":7,"hi":9},"raam":{"lo":5,"hi":6},"reservists":{"lo":0,"hi":5},"bluewhite":{"lo":0,"hi":0},"amcha":{"lo":0,"hi":5},"haredi_public":{"lo":0,"hi":0}};
/** ממוצע הסקרים (אחוזים) — לאחוז של רשימה עם 0 מנדטים כשהשערה נשמרה בלי אחוזים */
export const POLL_SHARES = {"amcha":3.21,"bluewhite":1.16,"democrats":7.23,"haredi_public":0.67,"joint":6.16,"likud":17.36,"otzma":6.24,"raam":4.26,"reservists":2.99,"rzp":4.89,"shas":6.26,"together":9.2,"utj":6.18,"yashar":17.02,"yb":6.47};
/** ברירות המחדל של החישוב באתר (src/pages/guess/pctSync.ts): בעלי זכות, הסכמי עודפים */
export const ELIGIBLE = 7336553;
export const AGREEMENTS = [["likud","rzp"],["together","yb"],["yashar","democrats"],["raam","joint"],["shas","utj"]];
export const IDS_2026 = new Set(LISTS_2026.map((l) => l.id));
export const IDS_2022 = new Set(LISTS_2022);
export const GOV37 = new Set(LISTS_2026.filter((l) => l.gov37).map((l) => l.id));
