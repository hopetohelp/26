/**
 * צבירת הדשבורד — פונקציות טהורות בלבד (בלי מאגר, בלי שעון): מקבלות משתתפים וגרסאות ומחזירות JSON.
 * הכללים: docs/השתתפות-גולשים.md, "הדשבורד — כללים".
 *
 * - יחידת ספירה: משתתף ייחודי, הגרסה האחרונה שלו בכל יחידה.
 * - משתתף "בבדיקה" (review) אינו נספר בשום מספר ראשי; מוצג בנפרד ב-underReview.
 * - כל תא וחתך עם תשובה אחת לפחות מוצג, בלי הסתרת קבוצות קטנות (הכרעת בעלים 7.10.2026).
 * - הדשבורד פתוח גם במספר משתתפים קטן; נתוני קבוצה קטנה אינם מייצגים.
 * - יחידה מפורסמת מתחלפת רק אם לפחות משתתף ייחודי אחד חדשים/ששינו השפיעו עליה מאז הפרסום הקודם;
 *   אחרת נשארת היחידה הקודמת כמו שהיא (כולל n, of ומועד הפרסום שלה).
 * - מטריצה, פילוח לפי הצבעה ומגמה — רק בריצה הראשונה אחרי חצות שעון ישראל; באותה ריצה מתפרסמים גם החלקים הכלליים,
 *   כך שהכלליים והפילוחים נגזרים מאותה תמונה, וכל חתך שיש בו תשובות מתפרסם.
 */
import { LISTS_2026, GOV37, IDS_2026, IDS_2022, OFFICIAL_2022, POLLS, POLLS_AS_OF } from "./lists.js";

import { FIXED_BLOCS, migrateBlocs, compositionKey } from "./blocDefinitions.js";
import { moderate } from "./moderation.js";

export const K_CELL = 1;
export const K_ROW = 1;
export const OPEN_AT = 0;
export const MIN_CHANGED = 1;
export const TOTAL = 120;
export const DASHBOARD_POLICY = "verified-v6";
export const HOURLY = ["seats", "blocs", "vote2026", "vote2022", "underReview"];
export const DAILY = ["matrix", "byVote", "trend"];
/** אילו יחידות משפיעות על כל חלק בדשבורד */
export const SECTION_UNITS = {
  seats: ["seats"],
  blocs: ["seats", "blocs"],
  vote2026: ["vote"],
  vote2022: ["vote"],
  underReview: ["seats"],
  matrix: ["vote"],
  byVote: ["vote", "seats"],
  trend: ["seats"],
};

const r2 = (x) => Math.round(x * 100) / 100;

/** יום בשעון ישראל (YYYY-MM-DD) של רגע נתון */
export function israelDay(t) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(t),
  );
}

/** הגרסה האחרונה (המזהה הגבוה) של כל משתתף בכל יחידה. filter אופציונלי על גרסה */
export function latestByUnit(versions, filter = () => true) {
  const out = { vote: new Map(), seats: new Map(), blocs: new Map() };
  for (const v of versions) {
    if (!out[v.unit] || !filter(v)) continue;
    const cur = out[v.unit].get(v.participant);
    if (!cur || v.id > cur.id) out[v.unit].set(v.participant, v);
  }
  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** ממוצע, חציון, רבעונים */
export function seatStat(list, values) {
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
  return { list, n: s.length, mean: r2(mean), min: s[0] ?? 0, max: s[s.length - 1] ?? 0, median: r2(quantile(s, 0.5)), p25: r2(quantile(s, 0.25)), p75: r2(quantile(s, 0.75)) };
}

/**
 * ספירות ⇐ תאים עם סף והסתרה משלימה. counts: {key: n}, of: המכנה המפורסם.
 * תא מתחת לסף מוסתר (n לא נחשף). אם נשאר בדיוק תא מוסתר אחד — מוסתר גם התא הגלוי הקטן ביותר, כדי שאי אפשר יהיה לחשב אותו מהמכנה.
 */
export function suppress(counts, of, k = K_CELL) {
  const keys = Object.keys(counts);
  const hidden = new Set(keys.filter((key) => counts[key] > 0 && counts[key] < k));
  if (hidden.size === 1) {
    const visible = keys.filter((key) => !hidden.has(key) && counts[key] > 0).sort((a, b) => counts[a] - counts[b]);
    if (visible.length) hidden.add(visible[0]);
  }
  const out = {};
  for (const key of keys) out[key] = hidden.has(key) ? { n: 0, of, hidden: true } : { n: counts[key], of };
  return out;
}

const seatValue = (payload, id) => payload.seats[id]?.v ?? 0;

function seatsStats(seatVersions) {
  return LISTS_2026.map((l) => seatStat(l.id, seatVersions.map((v) => seatValue(v.payload, l.id))));
}

export function computeSeats(seatVersions, history = seatVersions) {
  const n = seatVersions.length;
  if (n < K_CELL) return null;
  const manual = [];
  for (const l of LISTS_2026) {
    const vals = seatVersions.filter((v) => v.payload.seats[l.id]?.src === "manual").map((v) => v.payload.seats[l.id].v);
    if (vals.length >= K_CELL) manual.push(seatStat(l.id, vals));
  }
  let filled = 0;
  let usedFillAll = 0;
  const starts = { zero: 0, k25: 0, polls: 0 };
  const asOf = {};
  for (const v of seatVersions) {
    const cells = Object.values(v.payload.seats);
    const f = cells.filter((c) => c.src === "filled").reduce((a, c) => a + c.v, 0);
    filled += f;
    if (cells.some((c) => c.src === "filled")) usedFillAll++;
    starts[v.payload.start]++;
    if (v.payload.pollsAsOf) asOf[v.payload.pollsAsOf] = (asOf[v.payload.pollsAsOf] || 0) + 1;
  }
  // ניחוש לפי אחוזי הצבעה: סטטיסטיקה של האחוזים, כשיש תשובה אחת לפחות
  const pctV = seatVersions.filter((v) => v.payload.mode === "pct" && v.payload.pct);
  const modes = { seats: n - pctV.length, pct: pctV.length };
  const pctStats = pctV.length >= K_CELL ? LISTS_2026.map((l) => seatStat(l.id, pctV.map((v) => v.payload.pct[l.id] ?? 0))) : undefined;
  const commonAsOf = Object.entries(asOf).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0] ?? null;
  return {
    n,
    full: seatsStats(seatVersions),
    everPassedLists: LISTS_2026.filter(l => history.some(v => seatValue(v.payload, l.id) >= 4)).map(l => l.id),
    manual,
    filledShare: r2(filled / (TOTAL * n)),
    usedFillAll,
    pollsAsOf: commonAsOf ?? POLLS_AS_OF,
    polls: POLLS,
    starts,
    modes,
    ...(pctStats ? { pctStats } : {}),
  };
}

export function computeBlocs(seatVersions, blocVersions, blocNames = {}) {
  let derived = null;
  if (seatVersions.length >= K_CELL) {
    const gov = seatVersions.map((v) => [...GOV37].reduce((a, id) => a + seatValue(v.payload, id), 0));
    derived = { gov: seatStat("gov", gov), rest: seatStat("rest", gov.map((g) => TOTAL - g)) };
  }
  const fixed = FIXED_BLOCS.map(b => ({ ...b, stat: seatVersions.length ? seatStat(b.id, seatVersions.map(v => b.lists.reduce((sum, id) => sum + seatValue(v.payload, id), 0))) : null }));
  const g = [];
  const r = [];
  let gov37Count = 0;
  let customCount = 0;
  const customGroups = new Map();
  const seatsByParticipant = new Map(seatVersions.map((v) => [v.participant, v]));
  for (const v of blocVersions) {
    if (v.payload.mode === "custom") {
      customCount++;
      const seen = new Set();
      for (const b of migrateBlocs(v.payload).blocs) {
        const lists = [...new Set(b.lists)].sort();
        const name = blocNames[compositionKey(lists)] ?? (b.name.trim() || "גוש נוסף");
        const key = JSON.stringify(lists);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!customGroups.has(key)) customGroups.set(key, { name, lists, n: 0, targets: [], totals: [] });
        const group = customGroups.get(key);
        group.n++;
        if (b.target !== null) group.targets.push(b.target);
        const seatVersion = seatsByParticipant.get(v.participant);
        if (seatVersion) group.totals.push(lists.reduce((sum, id) => sum + seatValue(seatVersion.payload, id), 0));
      }
      continue;
    }
    gov37Count++;
    const gb = v.payload.blocs.find((b) => b.id === "gov");
    const rb = v.payload.blocs.find((b) => b.id === "rest");
    if (gb && gb.target !== null) g.push(gb.target);
    if (rb && rb.target !== null) r.push(rb.target);
  }
  const explicit = gov37Count
    ? { gov: g.length >= K_CELL ? seatStat("gov", g) : null, rest: r.length >= K_CELL ? seatStat("rest", r) : null }
    : null;
  if (!derived && !explicit && customCount < K_CELL) return null;
  const custom = [...customGroups.values()].map(({ name, lists, n, targets, totals }) => ({
    name, lists, n,
    eligible: lists.length >= 2 && totals.length > 0 && totals.reduce((sum, n) => sum + n, 0) >= 4 * lists.length * totals.length,
    explicit: targets.length ? seatStat("custom", targets) : null,
    derived: totals.length ? seatStat("custom", totals) : null,
  })).sort((a, b) => b.n - a.n || (b.derived?.mean ?? -1) - (a.derived?.mean ?? -1) || a.name.localeCompare(b.name, "he") || a.lists.join(",").localeCompare(b.lists.join(",")));
  return { derived, fixed, explicit, customCount, custom };
}

function countBy(items, key) {
  const c = {};
  for (const it of items) {
    const k = key(it);
    if (k !== null && k !== undefined) c[k] = (c[k] || 0) + 1;
  }
  return c;
}

export function computeVote2026(voteVersions) {
  const vals = voteVersions.map((v) => v.payload.v2026).filter((x) => x !== null);
  if (vals.length < K_CELL) return null;
  const all = countBy(vals, (x) => x);
  const namedVals = vals.filter((x) => IDS_2026.has(x));
  const named = countBy(namedVals, (x) => x);
  return { all: suppress(all, vals.length), named: namedVals.length >= K_CELL ? suppress(named, namedVals.length) : {} };
}

export function computeVote2022(voteVersions) {
  const vals = voteVersions.map((v) => v.payload.v2022).filter((x) => x !== null);
  if (vals.length < K_CELL) return null;
  const validVals = vals.filter((x) => IDS_2022.has(x) || x === "other");
  return {
    all: suppress(countBy(vals, (x) => x), vals.length),
    valid: validVals.length >= K_CELL ? suppress(countBy(validVals, (x) => x), validVals.length) : {},
    official: OFFICIAL_2022,
  };
}

/** מטריצת מעברים: שורה = הצבעה 2022, עמודה = 2026. כל שורה שיש בה תשובות מוצגת */
export function computeMatrix(voteVersions, publishedAt) {
  const pairs = voteVersions.map((v) => v.payload).filter((p) => p.v2022 !== null && p.v2026 !== null);
  if (pairs.length < K_ROW) return null;
  const rowCounts = countBy(pairs, (p) => p.v2022);
  const rowCells = suppress(rowCounts, pairs.length, K_ROW);
  const rows = {};
  for (const [row, n] of Object.entries(rowCounts)) {
    if (rowCells[row].hidden) {
      rows[row] = { n: 0, hidden: true, cells: {} };
      continue;
    }
    rows[row] = { n, cells: suppress(countBy(pairs.filter((p) => p.v2022 === row), (p) => p.v2026), n) };
  }
  return { rows, publishedAt };
}

/** ממוצע השערות המנדטים לפי כוונת הצבעה 2026 (כל חתך עם תשובות מוצג) */
export function computeByVote(voteMap, seatMap) {
  const groups = {};
  const totals = [seatMap.size];
  for (const [p, sv] of seatMap) {
    const code = voteMap.get(p)?.payload.v2026;
    if (!code) continue;
    (groups[code] ||= []).push(sv);
  }
  totals.push(Object.values(groups).reduce((a, g) => a + g.length, 0));
  const out = {};
  for (const [code, list] of Object.entries(groups)) {
    if (list.length < K_CELL) continue;
    // הגנה מחיסור: חתך שגודלו קרוב (פחות מסף התא) לסך כללי שמתפרסם מאותה תמונה — לא מתפרסם
    if (totals.some((t) => t - list.length > 0 && t - list.length < K_CELL)) continue;
    out[code] = { n: list.length, seats: Object.fromEntries(LISTS_2026.map((l) => [l.id, r2(list.reduce((a, v) => a + seatValue(v.payload, l.id), 0) / list.length)])) };
  }
  return out;
}

/** מגמה: מצב בסוף כל יום (שעון ישראל) עד אתמול, לפי הגרסאות שהיו קיימות אז */
export function computeTrend(seatVersions, today) {
  const byDay = new Map();
  for (const v of seatVersions) {
    const d = israelDay(v.created_at);
    if (d >= today) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(v);
  }
  const days = [...byDay.keys()].sort();
  const state = new Map();
  const out = [];
  for (const day of days) {
    let newcomers = 0;
    const changed = new Set();
    for (const v of byDay.get(day).sort((a, b) => a.id - b.id)) {
      if (!state.has(v.participant)) newcomers++;
      else if (!changed.has(v.participant) && state.get(v.participant).day !== day) changed.add(v.participant);
      state.set(v.participant, { v, day });
    }
    const cur = [...state.values()].map((x) => x.v);
    const n = cur.length;
    const seats = n >= K_CELL ? Object.fromEntries(LISTS_2026.map((l) => [l.id, r2(cur.reduce((a, v) => a + seatValue(v.payload, l.id), 0) / n)])) : {};
    out.push({ day, n, newcomers, changed: changed.size, seats });
  }
  return out;
}

export function computeUnderReview(reviewSeatVersions, reviewParticipants) {
  if (!reviewParticipants) return null;
  return { participants: reviewParticipants, seats: reviewSeatVersions.length >= K_CELL ? seatsStats(reviewSeatVersions) : [] };
}

/**
 * ריצת צבירה מלאה.
 * participants: [{id, review}] · versions: [{id, participant, unit, created_at, payload}] · now: ISO
 * wasOpen: האם הדשבורד הקודם היה פתוח
 * previous: {section: {json, publishedAt, snapshot: number[]}} — הפרסום הקודם של כל חלק · lastDailyDay: היום (ישראל) של החישוב היומי הקודם
 * מחזיר {dashboard, sections: {section: {json, publishedAt, snapshot, contributors, changed}}, daily}
 */
/**
 * חשבון מאומת = יש לו Google או מייל מאומת (הכרעת בעלים 9.10.2026). רק מאומתים נספרים בסטטיסטיקות; חשבונות שלא אומתו
 * מרוכזים באזור נפרד (נספרים בלבד בדשבורד הציבורי; הנתונים עצמם — בממשק הניהול). שורה בלי השדה verified נחשבת מאומתת
 * (תאימות לבדיקות); השרת מספק תמיד 0 או 1.
 */
const isVerified = (p) => p.verified !== 0 && p.verified !== false;

export function aggregate({ participants, versions, now, previous = {}, lastDailyDay = null, aggregationId, wasOpen = true, blocNames = {}, decisions = new Map() }) {
  const review = new Set(participants.filter((p) => p.review).map((p) => p.id));
  // known = המשתתפים שנספרים: מאומתים, ולא "בבדיקה"
  const known = new Set(participants.filter((p) => !p.review && isVerified(p)).map((p) => p.id));
  const unverified = new Set(participants.filter((p) => !p.review && !isVerified(p)).map((p) => p.id));
  const main = latestByUnit(versions, (v) => known.has(v.participant) && !review.has(v.participant));
  // השערות חריגות ממתינות לאישור מנהל (moderation.js): לא נספרות בשום חלק עד שאושרו
  const mod = moderate([...main.seats.values()], decisions);
  for (const [p, v] of [...main.seats]) if (mod.pending.has(v.id) || mod.rejected.has(v.id)) main.seats.delete(p);
  const countedSeat = (v) => v.unit === "seats" && known.has(v.participant) && !review.has(v.participant) && !mod.isExcluded(v);
  const rev = latestByUnit(versions, (v) => review.has(v.participant));
  const active = new Set([...main.vote.keys(), ...main.seats.keys(), ...main.blocs.keys()]);
  const reviewActive = new Set([...rev.vote.keys(), ...rev.seats.keys(), ...rev.blocs.keys()]);
  // האזור הנפרד: חשבונות שלא אומתו ושמרו משהו
  const unv = latestByUnit(versions, (v) => unverified.has(v.participant));
  const unverifiedActive = new Set([...unv.vote.keys(), ...unv.seats.keys(), ...unv.blocs.keys()]);
  const kinds = { google: 0, email: 0 };
  for (const p of participants) if (active.has(p.id)) kinds[p.google ? "google" : "email"]++;
  const today = israelDay(now);
  const daily = lastDailyDay !== today;
  // במעבר מדשבורד סגור לפתוח — כל החלקים מתפרסמים מחדש, ולא נשארים קפואים מתקופת הסגירה
  const opening = active.size >= OPEN_AT && !wasOpen;
  const seatV = [...main.seats.values()];
  const voteV = [...main.vote.values()];

  const compute = {
    seats: () => computeSeats(seatV, versions.filter(countedSeat)),
    blocs: () => computeBlocs(seatV, [...main.blocs.values()], blocNames),
    vote2026: () => computeVote2026(voteV),
    vote2022: () => computeVote2022(voteV),
    underReview: () => computeUnderReview([...rev.seats.values()], reviewActive.size),
    matrix: () => computeMatrix(voteV, now),
    byVote: () => computeByVote(main.vote, main.seats),
    trend: () => computeTrend(versions.filter(countedSeat), today),
  };

  const sections = {};
  for (const name of [...HOURLY, ...DAILY]) {
    const isDaily = DAILY.includes(name);
    const units = SECTION_UNITS[name];
    const src = name === "underReview" ? rev : main;
    const owners = new Map();
    for (const u of units) for (const v of src[u].values()) owners.set(v.id, v.participant);
    const snapshot = [...owners.keys()].sort((a, b) => a - b);
    const prev = previous[name];
    const prevIds = new Set(prev?.snapshot || []);
    const changed = new Set([...owners].filter(([id]) => !prevIds.has(id)).map(([, p]) => p)).size;
    let publish;
    if (isDaily) publish = daily || !prev || opening;
    else if (name === "underReview") publish = true; // קבוצה קטנה ונפרדת — מתעדכנת בכל שעה
    // ביום של חישוב יומי — כל החלקים שחופפים לפילוחים מתפרסמים מאותה תמונה (מניעת חיסור בין תמונות שונות)
    else publish = !prev || changed >= MIN_CHANGED || daily || opening;
    if (publish) sections[name] = { json: compute[name](), publishedAt: now, snapshot, contributors: new Set(owners.values()).size, changed };
    else sections[name] = { ...prev, changed, kept: true };
  }

  // שם מאושר מתעדכן גם בלי תשובות חדשות, בלי לשנות את תמונת הנתונים.
  if (sections.blocs.json?.custom) sections.blocs = { ...sections.blocs, json: {
    ...sections.blocs.json,
    custom: sections.blocs.json.custom.map(g => ({ ...g, name: blocNames[compositionKey(g.lists)] ?? g.name })),
  } };
  const open = active.size >= OPEN_AT;
  const dashboard = { publishedAt: now, aggregationId, participants: active.size, open, policy: DASHBOARD_POLICY, pendingGuesses: mod.pending.size, accounts: { ...kinds, unverified: unverifiedActive.size }, sectionsAsOf: {}, sectionParticipants: {} };
  if (open) {
    for (const [name, s] of Object.entries(sections)) {
      if (s.json === null || s.json === undefined) continue;
      dashboard[name] = s.json;
      dashboard.sectionsAsOf[name] = s.publishedAt;
      dashboard.sectionParticipants[name] = s.contributors;
    }
  } else if (sections.underReview.json) {
    dashboard.underReview = sections.underReview.json;
  }
  if (!("underReview" in dashboard)) dashboard.underReview = null;
  return { dashboard, sections, daily, today, pending: mod.pending, rejected: mod.rejected };
}
