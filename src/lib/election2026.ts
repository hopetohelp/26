import flow from "../data/flow2026.json";
import { listName, meta, registry } from "./data";
import { ELECTION_DAY, results2026 } from "./guessAccuracyData";

/**
 * הבחירות לכנסת ה-26 באותו מבנה של מערכות 2015–2022 (src/data/results.json), כדי שמסך "תוצאות" יהיה זהה לכל מערכת
 * (הכרעת בעלים 02.11.2026: "איחוד זהה"). מקור אחד לכל נתון:
 * בעלי זכות — registry.k26; הצביעו ופסולים — הספירה (flow2026.counted); קולות ומנדטים לכל רשימה וכשרים — raw/results-2026.json;
 * אותיות הפתק — flow2026.letters26; הסכמי העודפים — meta.agreements2026. מנוע החוק משחזר מהם בדיוק את המנדטים (נבדק בבדיקה).
 */
const counted = (flow as { counted?: { voters?: number; invalid?: number } }).counted ?? {};
const letterOf = Object.fromEntries(Object.entries((flow as { letters26: Record<string, string> }).letters26).map(([letters, id]) => [id, letters]));
const votes = results2026.votes ?? {};

export const K26_RESULT = {
  id: "k26",
  knesset: 26,
  label: "אוקטובר 2026",
  date: ELECTION_DAY,
  eligible: registry.k26.eligible,
  voted: counted.voters ?? 0,
  invalid: counted.invalid ?? 0,
  valid: results2026.valid ?? Object.values(votes).reduce((a, b) => a + b, 0),
  // מזהה הרשימה באתר משמש גם כמזהה בטבלה; אותיות הפתק — בשדה נפרד לתצוגה
  lists: Object.entries(votes)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => ({ letters: id, ballot: letterOf[id] ?? "", name: listName(id), short: listName(id), votes: v, seats: results2026.seats[id] ?? 0 })),
  agreements: meta.agreements2026.map((a) => [...a.pair]),
  source: { agreementsSource: meta.agreements2026.map((a) => a.source).join("; "), sha256: "", url: "https://votes26.bechirot.gov.il/nationalresults" },
};
