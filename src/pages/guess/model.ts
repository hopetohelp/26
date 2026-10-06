/** נתוני היסוד של "ההשערה שלך": הרשימות, ממוצע הסקרים, תוצאות 2022 והמיפוי המובהק ביניהן. */
import modelFile from "../../data/model.json";
import type { Bloc, BlocsPayload, SeatCell, SeatsPayload, VotePayload } from "../../lib/crowdApi";
import { lists2026, results } from "../../lib/data";

const model = modelFile as unknown as { asof: string; central: { seats: Record<string, number> } };

export const IDS = lists2026.map((l) => l.id);
export const ALPHA = [...lists2026].sort((a, b) => a.name.localeCompare(b.name, "he"));
export const POLLS: Record<string, number> = model.central.seats;
export const POLLS_AS_OF = model.asof;
export const nameOf = (id: string) => lists2026.find((l) => l.id === id)?.name ?? id;

const k25 = results.find((r) => r.id === "k25")!;
export const K25_LISTS = k25.lists as { letters: string; short: string; name: string; seats: number }[];
export const K25_PASSED = K25_LISTS.filter((l) => l.seats > 0);
export const K25_IDS = K25_LISTS.map((l) => l.letters);
export const k25Name = (letters: string) => K25_LISTS.find((l) => l.letters === letters)?.short ?? letters;

/** רק התאמות מובהקות — אותה רשימה בשם ובהרכב. כל השאר נשאר ריק, וזה מוסבר בממשק. */
export const K25_MAP: Record<string, string> = { likud: "מחל", shas: "שס", utj: "ג", yb: "ל", raam: "עם" };

export const LOCK_AT = Date.parse("2026-10-26T23:59:00+02:00");
export const THRESHOLD_SEATS = 4;

export function startSeats(start: SeatsPayload["start"]): SeatsPayload {
  const seats: Record<string, SeatCell> = {};
  for (const id of IDS) {
    if (start === "zero") seats[id] = { v: 0, src: "manual", locked: false };
    else if (start === "polls") seats[id] = { v: POLLS[id] ?? 0, src: "filled", locked: false };
    else {
      const l = K25_MAP[id] ? K25_LISTS.find((x) => x.letters === K25_MAP[id]) : undefined;
      seats[id] = l ? { v: l.seats, src: "manual", locked: true } : { v: 0, src: "manual", locked: false };
    }
  }
  return { seats, start, pollsAsOf: start === "polls" ? POLLS_AS_OF : null };
}

export const GOV_IDS = lists2026.filter((l) => l.gov37).map((l) => l.id);
export function gov37Blocs(): Bloc[] {
  return [
    { id: "gov", name: "מפלגות הממשלה היוצאת", lists: GOV_IDS, target: null },
    { id: "rest", name: "שאר הרשימות", lists: IDS.filter((id) => !GOV_IDS.includes(id)), target: null },
  ];
}
export const DEFAULT_BLOCS: BlocsPayload = { mode: "gov37", blocs: gov37Blocs() };
export const EMPTY_VOTE: VotePayload = { v2022: null, v2026: null };

export const V2022_LABEL: Record<string, string> = {
  other: "רשימה אחרת",
  none: "לא הצבעתי",
  blank: "פתק לבן או פסול",
  ineligible: "לא הייתה לי זכות הצבעה",
  private: "מעדיף/ה לא לומר",
};
export const V2026_LABEL: Record<string, string> = { undecided: "עוד לא החלטתי", none: "לא אצביע", private: "מעדיף/ה לא לומר" };
