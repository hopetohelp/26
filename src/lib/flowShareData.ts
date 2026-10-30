/**
 * הנתונים של תמונות השיתוף של "מה השתנה" (הכרעת בעלים 29.10.2026) — בלי ציור: מודל תמונה שהקנבס (`flowShareDraw.ts`) רק מצייר.
 * כל מספר נגזר מאותם מקורות כמו המסך: `partyYears` (ארבעת הפרמטרים), `cameFromGroup`/`wentToGroup` (תנועה) ו-`flow-units.json` (ערים).
 */
import { cameFromGroup, countedPct, flow, newName, oldName, partyYears, SAME, smallPct, wentToGroup, type FlowPart } from "./voterFlow";
import { changeOf, PARAM_NAMES, type Change } from "./changeMark";
import { DEFAULT_LINEAGE } from "./lineage";
import { num, pctOne } from "./format";
import { sumBallotVotes, validBallotVotes, type BallotUnits } from "./ballotLookup";

export type Who = "all" | "haredi" | "party";
export type Where = "country" | "city";
export interface ShareSpec { who: Who; party: string; where: Where; city: string }

/** "חרדים": ש"ס ויהדות התורה, כל אחת בנפרד (הכרעת בעלים 28.10.2026) */
export const HAREDI = ["shas", "utj"];
/** הרשימות הקטנות — מוצגות החל מ-0.1%, כמו במסך (הכרעת בעלים 28.10.2026) */
const SMALL = new Set(["reservists", "amcha", "code_black", "haredi_public", "noam"]);
/** מקור קטן מ-1% לא מוצג בכרטיס "מאיפה הגיעו"; כמה שורות נכנסות — לפי המקום בתמונה */
const MIN_SHARE = 1;
const ENVELOPES = "9999";
/** ערים עם לפחות 5% ממצביעי המפלגה (הכרעת בעלים 28.10.2026); מפלגה שמצביעיה מפוזרים — חמש הערים עם הכי הרבה מצביעים שלה */
const MIN_CITY_SHARE = 0.05;
const LETTER_OF = Object.fromEntries(Object.entries(flow.letters26).map(([l, id]) => [id, l]));
const prevOf = (id: string) => DEFAULT_LINEAGE.map[id] ?? [];

export interface ParamCardModel { key: keyof typeof PARAM_NAMES; label: string; value: string; change: Change | null }
export interface FlowLine { name: string; short?: string; share: number; text: string }
export interface CityLine { name: string; change: Change | null; small: string | null }
export interface PartyBlock { name: string; params: ParamCardModel[]; cities: CityLine[]; from: FlowLine[]; to: FlowLine[] }
export interface TableCell { value: string; change: Change | null }
export interface TableRow { name: string; cells: TableCell[] }
export interface Scene {
  kind: "party" | "haredi" | "all";
  title: string;
  /** "94% מספירת הקולות" */
  sub: string;
  /** מפלגה אחת — בלוק אחד; חרדים — שניים; כל המפלגות — אין */
  blocks: PartyBlock[];
  table?: { headers: string[]; rows: TableRow[] };
  /** יש בתמונה כרטיסי "השינוי הגדול ביותר" (רק בכל הארץ) */
  withCities: boolean;
}

const pctText = (v: number | null) => (v === null ? "—" : pctOne(v));
const sub = () => { const c = countedPct(); return c === null ? "" : `${c}% מספירת הקולות`; };
const diff = (a: number | null, b: number | null, kind: "count" | "pct") => (a === null || b === null ? null : changeOf(b - a, kind));

/** ארבעת הפרמטרים בסדר הקבוע: מצביעים, מנדטים, מזכות בחירה, מהכשרים (מנדטים רק בכל הארץ) */
export function paramCards(votes: [number | null, number | null], seats: [number, number] | null, ofEligible: [number | null, number | null], ofValid: [number | null, number | null]): ParamCardModel[] {
  const out: ParamCardModel[] = [{ key: "votes", label: PARAM_NAMES.votes, value: votes[1] === null ? "—" : num(votes[1]), change: diff(votes[0], votes[1], "count") }];
  if (seats) out.push({ key: "seats", label: PARAM_NAMES.seats, value: String(seats[1]), change: diff(seats[0], seats[1], "count") });
  out.push({ key: "ofEligible", label: PARAM_NAMES.ofEligible, value: pctText(ofEligible[1]), change: diff(ofEligible[0], ofEligible[1], "pct") },
    { key: "ofValid", label: PARAM_NAMES.ofValid, value: pctText(ofValid[1]), change: diff(ofValid[0], ofValid[1], "pct") });
  return out;
}

/** הפרמטרים של מפלגה בכל הארץ — מ-`partyYears`, אותו מקור כמו כרטיס המפלגה במסך */
export function countryParams(id: string): ParamCardModel[] {
  const { y2022, y2026 } = partyYears(id, SAME[id] ?? null);
  const seats = y2026?.seats ?? 0;
  // בלי 2022 ל"אותה" מפלגה — אין שינוי, ולכן ערך המנדטים בלבד
  return paramCards([y2022?.votes ?? null, y2026?.votes ?? null], [y2022?.seats ?? seats, seats],
    [y2022?.ofEligible ?? null, y2026?.ofEligible ?? null], [y2022?.ofValid ?? null, y2026?.ofValid ?? null]);
}

export interface CityStat { code: string; name: string; votes26: number; votes22: number | null; el26: number; el22: number | null; valid26: number; valid22: number | null }
/** הקולות של קבוצת רשימות בכל יישוב (או ביישוב אחד): 2026 — הרשימות עצמן; 2022 — הרשימות שקדמו להן לפי השיוך של האתר; בלי קודמת — אין השוואה */
export function cityStats(u: BallotUnits, ids: string[], only?: string): CityStat[] {
  const l26 = ids.map((id) => u.letters26.indexOf(LETTER_OF[id])).filter((k) => k >= 0);
  const l22 = [...new Set(ids.flatMap(prevOf))].map((l) => u.letters22.indexOf(l)).filter((k) => k >= 0);
  const sum = (rows: { 2: number }[] | unknown[][]) => (rows as number[][]).reduce((s, r) => s + r[2], 0);
  return Object.entries(u.places).filter(([code, p]) => code !== ENVELOPES && p.y26.length && (!only || code === only)).map(([code, p]) => ({
    code, name: p.name,
    votes26: sumBallotVotes(p.y26, l26), votes22: l22.length && p.y22.length ? sumBallotVotes(p.y22, l22) : null,
    el26: sum(p.y26), el22: p.y22.length ? sum(p.y22) : null,
    valid26: validBallotVotes(p.y26, u.letters26.length), valid22: p.y22.length ? validBallotVotes(p.y22, u.letters22.length) : null,
  }));
}
const share = (v: number | null, base: number | null) => (v === null || !base ? null : (v / base) * 100);

/** "השינוי הגדול ביותר": הערים שבהן השינוי באחוז מבעלי זכות הבחירה הגדול ביותר, לפי הערך המוחלט; בקטן — האחוז מבעלי זכות הבחירה ב-2026 */
export function biggestChangeCities(stats: CityStat[], n: number): CityLine[] {
  const total = stats.reduce((a, c) => a + c.votes26, 0);
  const hit = stats.filter((c) => c.votes26 >= total * MIN_CITY_SHARE);
  const pool = hit.length ? hit : [...stats].sort((a, b) => b.votes26 - a.votes26).slice(0, 5);
  return pool.flatMap((c) => {
    const now = share(c.votes26, c.el26), before = share(c.votes22, c.el22);
    return now === null || before === null ? [] : [{ c, now, delta: now - before }];
  }).filter((x) => changeOf(x.delta, "pct")).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, n)
    .map((x) => ({ name: x.c.name, change: changeOf(x.delta, "pct"), small: pctOne(x.now) }));
}

/** אותה מפלגה בשתי הבחירות (אותו שם; לא רשימה שהחליפה שם) — בלי לחזור על השם: "אותה מפלגה" / "נשארו במפלגה" */
const same = (id: string, letters: string | undefined) => !!letters && prevOf(id).includes(letters) && oldName(letters) === newName(id);
const pctLine = (p: FlowPart) => `${(SMALL.has(p.id) && smallPct(p.share) !== null ? smallPct(p.share) : smallPct(p.share) ?? "0")}%`;

/** "מאיפה הגיעו" — כל המקורות שמעל הסף, מהגדול לקטן; הציור בוחר כמה נכנסים */
export function fromLines(matrix: number[][], id: string): FlowLine[] {
  return cameFromGroup(matrix, [id]).filter((p) => p.share >= MIN_SHARE || (SMALL.has(p.id) && smallPct(p.share) !== null))
    .map((p) => ({ name: same(id, p.id) ? "אותה מפלגה" : p.name, share: p.share, text: pctLine(p) }));
}
/** "לאן הלכו" — היעדים של מצביעי 2022; מי שנשארו: "נשארו במפלגה", ואם אין מקום "נשארו" */
export function toLines(matrixTo: number[][], id: string): FlowLine[] {
  const prev = prevOf(id);
  if (!prev.length) return [];
  return wentToGroup(matrixTo, prev).filter((p) => p.share >= 1 || (SMALL.has(p.id) && smallPct(p.share) !== null))
    .map((p) => (p.id === id && same(id, prev[0]) ? { name: "נשארו במפלגה", short: "נשארו", share: p.share, text: pctLine(p) } : { name: p.name, share: p.share, text: pctLine(p) }));
}

interface CityMatrix { flows: number[][]; flowsTo?: number[][] }
const cityMatrix = (code: string): CityMatrix | undefined => (flow as unknown as { cities?: Record<string, CityMatrix> }).cities?.[code];

const placeOf = (u: BallotUnits, name: string) => Object.entries(u.places).find(([code, p]) => code !== ENVELOPES && p.name === name.trim());

/** בלוק של מפלגה: ארבעת הפרמטרים (בעיר — שלושה), ערים בולטות, ותנועה */
function partyBlock(id: string, spec: ShareSpec, units: BallotUnits | null, nCities: number): PartyBlock | null {
  const name = newName(id);
  if (spec.where === "city") {
    const place = units && placeOf(units, spec.city);
    if (!units || !place) return null;
    const st = cityStats(units, [id], place[0])[0];
    if (!st) return null;
    const m = cityMatrix(place[0]);
    return {
      name,
      params: paramCards([st.votes22, st.votes26], null, [share(st.votes22, st.el22), share(st.votes26, st.el26)], [share(st.votes22, st.valid22), share(st.votes26, st.valid26)]),
      cities: [], from: m ? fromLines(m.flows, id) : [], to: m ? toLines(m.flowsTo ?? m.flows, id) : [],
    };
  }
  const national = flow.national;
  return {
    name, params: countryParams(id),
    cities: units && nCities ? biggestChangeCities(cityStats(units, [id]), nCities) : [],
    from: fromLines(national.flows, id), to: toLines(national.flowsTo, id),
  };
}

const where = (spec: ShareSpec) => (spec.where === "city" ? spec.city.trim() : "כל הארץ");

const PARTIES = flow.new.filter((id) => id !== "other" && id !== "abstain");

/** כל המפלגות: שורה לכל רשימה עם הנתון והשינוי בכל פרמטר (בעיר — בלי מנדטים) */
function allTable(spec: ShareSpec, units: BallotUnits | null): Scene["table"] | null {
  const city = spec.where === "city";
  const headers = [PARAM_NAMES.votes, ...(city ? [] : [PARAM_NAMES.seats]), PARAM_NAMES.ofEligible, PARAM_NAMES.ofValid];
  const place = city && units ? placeOf(units, spec.city) : undefined;
  if (city && (!units || !place)) return null;
  const rows = PARTIES.map((id) => {
    let cards: ParamCardModel[], votes: number;
    if (city) {
      const st = cityStats(units!, [id], place![0])[0];
      votes = st?.votes26 ?? 0;
      cards = st ? paramCards([st.votes22, st.votes26], null, [share(st.votes22, st.el22), share(st.votes26, st.el26)], [share(st.votes22, st.valid22), share(st.votes26, st.valid26)]) : [];
    } else {
      const { y2026 } = partyYears(id, SAME[id] ?? null);
      votes = y2026?.votes ?? 0;
      cards = y2026 ? countryParams(id) : [];
    }
    return { id, votes, row: { name: newName(id), cells: cards.map((c) => ({ value: c.value, change: c.change })) } };
  }).filter((r) => r.votes > 0 && r.row.cells.length).sort((a, b) => b.votes - a.votes);
  return { headers, rows: rows.map((r) => r.row) };
}

/** מודל התמונה לפי הבחירה בחלון; null — עד שהנתונים מוכנים (למשל עיר שלא נבחרה מהרשימה) */
export function buildScene(spec: ShareSpec, units: BallotUnits | null): Scene | null {
  if (spec.where === "city" && !(units && placeOf(units, spec.city))) return null;
  const at = where(spec);
  if (spec.who === "all") {
    const table = allTable(spec, units);
    return table ? { kind: "all", title: `כל המפלגות • ${at}`, sub: sub(), blocks: [], table, withCities: false } : null;
  }
  const ids = spec.who === "haredi" ? HAREDI : [spec.party];
  const blocks = ids.map((id) => partyBlock(id, spec, units, spec.who === "haredi" ? 2 : 3));
  if (blocks.some((b) => !b)) return null;
  return {
    kind: spec.who === "haredi" ? "haredi" : "party",
    title: `${spec.who === "haredi" ? "המפלגות החרדיות" : newName(spec.party)} • ${at}`,
    sub: sub(), blocks: blocks as PartyBlock[], withCities: spec.where === "country",
  };
}

