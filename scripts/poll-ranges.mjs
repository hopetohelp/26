// טווח הסקרים לכל רשימה — לבדיקת השערות חריגות בשרת ההשתתפות (הכרעת בעלים 12.10.2026).
// אותו טווח שבאתר ("כל המפלגות" במסך המצב היום, src/lib/data.ts latestPerPollster): הסקר האחרון של כל מכון+מזמין
// ב-14 הימים שמסתיימים ביום הממוצע (model.asof), מסקרים שפורסמו ועקביים. רשימה מתחת לסף בסקר = 0.
// נכתב ל-public/poll-ranges.json בכל בנייה (npm run build); השרת קורא אותו מהאתר. בדיקה: src/lib/pollRanges.test.ts
import { readFileSync, writeFileSync } from "node:fs";

const DAY = 86_400_000;
const toTime = (d) => Date.parse(d + "T12:00:00Z");

export function seatsIn(p, id) {
  const v = p.values[id];
  if (!v) return undefined;
  if (Number.isFinite(v.s) && v.s >= 0 && v.s <= 120) return v.s;
  if (Number.isFinite(v.p) && v.p >= 0 && v.p < 3.25) return 0;
  return undefined;
}

export function pollRanges(polls, lists, asOf, days = 14) {
  const end = toTime(asOf);
  const map = new Map();
  for (const p of polls) {
    if (!p.eligibleToShow || !p.consistent) continue;
    const t = toTime(p.end);
    if (t > end || t <= end - days * DAY) continue;
    const k = `${p.firm}|${p.publisher ?? ""}`;
    const cur = map.get(k);
    if (!cur || p.end > cur.end) map.set(k, p);
  }
  const latest = [...map.values()];
  const out = {};
  for (const id of lists) {
    const xs = latest.map((p) => seatsIn(p, id)).filter((x) => typeof x === "number");
    if (xs.length) out[id] = { lo: Math.min(...xs), hi: Math.max(...xs) };
  }
  return { asOf, polls: latest.length, ranges: out };
}

/** רשימות שלא עברו את אחוז החסימה (4 מנדטים) באף סקר שפורסם ועקבי — אי אפשר לנחש עליהן (הכרעת בעלים 24.10.2026). כמו CLOSED_LISTS באתר */
export function closedLists(polls, lists) {
  return lists.filter((id) => !polls.some((p) => p.eligibleToShow && p.consistent && (seatsIn(p, id) ?? 0) >= 4));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL("../src/data/", import.meta.url);
  const polls = JSON.parse(readFileSync(new URL("polls.json", root), "utf8")).polls;
  const model = JSON.parse(readFileSync(new URL("model.json", root), "utf8"));
  const meta = JSON.parse(readFileSync(new URL("meta.json", root), "utf8"));
  // תוצאות האמת (raw/results-2026.json) — לשרת, לספירת המנחשים שצדקו בכל הרשימות (הכרעת בעלים 28.10.2026)
  const results2026 = JSON.parse(readFileSync(new URL("../raw/results-2026.json", import.meta.url), "utf8"));
  const res = { ...pollRanges(polls, meta.lists2026.map((l) => l.id), model.asof), closed: closedLists(polls, meta.lists2026.filter((l) => !l.withdrawn).map((l) => l.id)),
    results: results2026.status !== "none" && Object.keys(results2026.seats ?? {}).length ? results2026.seats : null };
  writeFileSync(new URL("../public/poll-ranges.json", import.meta.url), JSON.stringify(res) + "\n");
  console.log(`poll-ranges: ${Object.keys(res.ranges).length} lists from ${res.polls} polls (as of ${res.asOf})`);
}
