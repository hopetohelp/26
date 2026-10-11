import pollsFile from "../data/polls.json";
import metaFile from "../data/meta.json";
import resultsFile from "../data/results.json";
import registryFile from "../data/registry.json";

export interface PollValue {
  /** מנדטים */
  s?: number;
  /** אחוז (מפלגה מתחת לסף) */
  p?: number;
}

export interface Poll {
  id: string;
  assumedPublishedAt?: string;
  start: string;
  end: string;
  firm: string;
  firmHe: string;
  publisher: string | null;
  publisherHe: string | null;
  sample: number | null;
  values: Record<string, PollValue>;
  gov: number | null;
  consistent: boolean;
  eligibleToShow: boolean;
  urls: string[];
  verified: boolean;
  verification?: {
    status: "match" | "corrected" | "partial" | "unreachable" | "mismatch" | "secondary";
    checkedAt: string;
    source: string | null;
    details: { published?: string | null; population?: string | null; moe?: string | number | null; method?: string | null; sample_respondents?: number | null };
  };
  corrections?: { field: string; from: unknown; to: unknown; source: string | null }[];
  source: { page: string; tableLine: number };
}

export const VERIFICATION_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "neutral" }> = {
  secondary: { text: "מקור משני", tone: "neutral" },
  match: { text: "אומת מול המקור", tone: "ok" },
  corrected: { text: "תוקן לפי המקור", tone: "ok" },
  partial: { text: "אומת חלקית", tone: "neutral" },
  unreachable: { text: "המקור אינו נגיש", tone: "warn" },
  mismatch: { text: "לא תואם למקור", tone: "warn" },
};

export function verificationLabel(status: string) {
  return VERIFICATION_LABEL[status] ?? { text: "טרם הושלם האימות", tone: "neutral" as const };
}

/** תיאור שדה מתוקן בעברית, למשל "ש"ס (מנדטים)" */
export function fieldLabel(field: string): string {
  const parts = field.split(".");
  if (parts[0] === "values") return `${listName(parts[1])} (${parts[2] === "s" ? "מנדטים" : "אחוז"})`;
  return ({ sample: "גודל המדגם", start: "תחילת העבודה בשטח", end: "סיום העבודה בשטח", firmHe: "עורך הסקר", gov: "סך מפלגות הממשלה", "others.pct": "אחרות (אחוז)" } as Record<string, string>)[field] ?? field;
}

export interface ListInfo {
  id: string;
  name: string;
  leader: string;
  gov37: boolean;
}

export const polls = pollsFile.polls as unknown as Poll[];

/** סקר על קבוצת אוכלוסייה מסוימת (למשל מצביעים לראשונה) — מוצג בארכיון בלבד, מחוץ לכל סטטיסטיקה של כלל הציבור */
export interface SubgroupPoll {
  id: string;
  start: string;
  end: string;
  firmHe: string;
  publisherHe: string;
  population: string;
  sample: number;
  values: Record<string, { s?: number; p?: number }>;
  urls: string[];
  note?: string;
}
export const subgroupPolls = ((pollsFile as { subgroupPolls?: unknown }).subgroupPolls ?? []) as SubgroupPoll[];
export const meta = metaFile as unknown as {
  dataAsOf: string;
  electionDay: string;
  lists2026: ListInfo[];
  agreements2026: { pair: [string, string]; status: string; source: string }[];
  historyNames: Record<string, string>;
  historyPolls?: number;
};
export const results = resultsFile;
export const registry = registryFile;

export const lists2026 = meta.lists2026;
export const listName = (id: string) =>
  lists2026.find((l) => l.id === id)?.name ?? meta.historyNames[id] ?? id;

/** סקרים שמותר ונכון להציג בניתוח: פורסמו לציבור ועקביים (סכום ≈ 120) */
export const usablePolls = polls.filter((p) => p.eligibleToShow && p.consistent);

export const pollsterKey = (p: Poll) => `${p.firm}|${p.publisher ?? ""}`;
export const pollsterLabel = (p: Poll) => `${p.firmHe}${p.publisherHe ? ` · ${p.publisherHe}` : ""}`;

/** ממוצע חשבוני. הכרעת בעלים 9.10.2026: באתר מציגים תמיד ממוצע, אף פעם לא חציון. */
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

const DAY = 86_400_000;
export const toTime = (d: string) => Date.parse(d + "T12:00:00Z");

/** הסקר האחרון של כל מכון+מזמין בחלון של `days` ימים עד `asOf` */
export function latestPerPollster(asOf: string, days = 14): Poll[] {
  const end = toTime(asOf);
  const map = new Map<string, Poll>();
  for (const p of usablePolls) {
    const t = toTime(p.end);
    if (t > end || t <= end - days * DAY) continue;
    const k = pollsterKey(p);
    const cur = map.get(k);
    if (!cur || p.end > cur.end) map.set(k, p);
  }
  return [...map.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
}

/** מנדטים בסקר: מפלגה מתחת לסף = 0; לא נשאלה = undefined */
export function seatsIn(p: Poll, id: string): number | undefined {
  const v = p.values[id];
  if (!v) return undefined;
  if (Number.isFinite(v.s) && v.s! >= 0 && v.s! <= 120) return v.s;
  if (Number.isFinite(v.p) && v.p! >= 0 && v.p! < 3.25) return 0;
  return undefined;
}

/** האם כל הסקרים (שנשאלו על הרשימה) נותנים לה מנדטים — אז היא "עוברת" בוודאות, לא "על הסף" (הכרעת בעלים) */
export function passesInAll(ps: Poll[], id: string): boolean {
  const xs = ps.map((p) => seatsIn(p, id)).filter((x): x is number => typeof x === "number");
  return xs.length > 0 && xs.every((x) => x > 0);
}

export interface PartySummary {
  id: string;
  /** ממוצע בין המכונים */
  mean: number;
  /** הנמוך והגבוה בין המכונים (טווח מלא) */
  min: number;
  max: number;
  n: number;
  /** בכמה מכונים הרשימה קיבלה מנדטים */
  passing: number;
  belowCount: number;
}

/** רוב המכונים נותנים לרשימה מנדטים: היא "עוברת" בסיכום. (ספירה, לא סטטיסטיקה של מרכז.) */
export const passesInMost = (s: Pick<PartySummary, "passing" | "n">) => s.passing >= Math.ceil(s.n / 2);

export function summarize(ps: Poll[], ids: string[]): PartySummary[] {
  return ids
    .map((id) => {
      const xs = ps.map((p) => seatsIn(p, id)).filter((x): x is number => typeof x === "number");
      return {
        id,
        mean: mean(xs),
        min: xs.length ? Math.min(...xs) : NaN,
        max: xs.length ? Math.max(...xs) : NaN,
        n: xs.length,
        passing: xs.filter((x) => x > 0).length,
        belowCount: ps.filter((p) => typeof p.values[id]?.p === "number").length,
      };
    })
    .filter((s) => s.n > 0)
    .sort((a, b) => b.mean - a.mean || b.max - a.max);
}

/** ממוצע מתגלגל של מנדטים — חלון של `days` ימים, נקודה כל `step` ימים */
/**
 * נקודת זמן בכל האתר (הכרעת בעלים 11.10.2026): נקודה כל 3 ימים, אחורה מהתאריך האחרון, ובה הסקר האחרון של כל מכון (מכון + מזמין)
 * מ-7 הימים שמסתיימים בה. כך כל מכון נספר פעם אחת, וכמעט כל המכונים בכל נקודה.
 */
export const POINT_DAYS = 3;
/** כל נקודה: הסקר האחרון של כל מכון בשבוע שמסתיים בה (הכרעת בעלים 11.10.2026, דרך הביניים) */
export const POINT_WINDOW = 7;
export function bucketLatest<T>(source: T[], endOf: (p: T) => string, keyOf: (p: T) => string, t: number, days = POINT_WINDOW): T[] {
  const map = new Map<string, T>();
  for (const p of source) {
    const e = toTime(endOf(p));
    if (e > t || e <= t - days * DAY) continue;
    const k = keyOf(p);
    const cur = map.get(k);
    if (!cur || endOf(p) > endOf(cur)) map.set(k, p);
  }
  return [...map.values()];
}
/** נקודות הזמן: כל 3 ימים, מהתאריך האחרון אחורה (כך שהנקודה האחרונה היא תמיד היום האחרון) */
export function pointTimes(from: string, to: string, step = POINT_DAYS): number[] {
  const out: number[] = [];
  for (let t = toTime(to); t >= toTime(from); t -= step * DAY) out.unshift(t);
  return out;
}

export function rollingMean(id: string, from: string, to: string, days = POINT_WINDOW, step = POINT_DAYS, source = usablePolls) {
  const out: { t: number; v: number; n: number; lo: number; hi: number; xs: number[] }[] = [];
  for (const t of pointTimes(from, to, step)) {
    const xs = bucketLatest(source, (p) => p.end, pollsterKey, t, days)
      .map((p) => seatsIn(p, id))
      .filter((x): x is number => typeof x === "number");
    // lo ו-hi = הנמוך והגבוה בין הסקרים בחלון (טווח מלא): נר הטווח בגרפי המגמה
    if (xs.length >= 3) out.push({ t, v: mean(xs), n: xs.length, lo: Math.min(...xs), hi: Math.max(...xs), xs });
  }
  return out;
}
