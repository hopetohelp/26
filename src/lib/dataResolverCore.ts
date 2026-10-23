import { allocate, type Agreement } from "../engine/baderOfer";
import { pctForSeats } from "../engine/pctForSeats";
import { bucketLatest, pollsterKey, seatsIn, sumPresent, toTime } from "./pollMath";
import type { Poll } from "./data";
import { pollSeatSummary } from "./pollRange";
import { DATA_PRODUCTS, SUPPORT_RECONSTRUCTION, MAJORITY_SEATS, METHOD_VERSION, POLL_WINDOW_DAYS, identity, sourceAllowed, type ProductId, type DataScreen } from "./dataCatalog";

export interface Selection { product: ProductId; source?: string; firms?: string[]; publishers?: string[]; asOf?: string; days?: number }
export interface SourceOption { id: string; label: string; firmId: string; publisherId: string | null; seriesId: string | null; explain: string }
/** המזהים נשענים על שמות המקור הפנימיים הקבועים, ולא על תווית התצוגה בעברית. */
export function sourceOptions(input: Poll[] = []): SourceOption[] {
  const firms = new Map<string, Map<string, Poll>>();
  for (const p of input) {
    const series = firms.get(p.firm) ?? new Map<string, Poll>();
    if (!series.has(pollsterKey(p))) series.set(pollsterKey(p), p);
    firms.set(p.firm, series);
  }
  return [...firms].sort(([a], [b]) => a.localeCompare(b)).flatMap(([firm, map]) => {
    const rows = [...map.values()];
    const options: SourceOption[] = rows.map(p => ({ id: `series:${pollsterKey(p)}`, label: `${p.firmHe}${p.publisherHe ? ` — ${p.publisherHe}` : ""}`, firmId: firm, publisherId: p.publisher, seriesId: pollsterKey(p), explain: "הסקר האחרון של הצירוף בחלון הסקרים" }));
    if (rows.length > 1) options.unshift({ id: `firm:${firm}`, label: rows[0].firmHe, firmId: firm, publisherId: null, seriesId: null, explain: "ממוצע הסקרים האחרונים של המכון" });
    return options;
  });
}

export interface Reconstruction {
  status: "available" | "missing" | "conflict";
  shares: Record<string, number> | null;
  origin: Record<string, "reported" | "reconstructed">;
  assumptions: string[];
}
/** הרשימות החסרות אינן אפס. אין שימוש בהחלקה או באפקט מכון של המודל. */
export function reconstructPoll(p: Poll, ids: string[], agreements: readonly Agreement[] = []): Reconstruction {
  const assumptions = ["שחזור אינו ייחודי", "לשחזור בלבד: מנגנון המרת מנדטים הקיים, עם הכרעת שוויון מתועדת לפי סדר הרשימות", "אחרות שלא דווחו: 1.5% כהנחת שחזור, אינן רשימה זכאית למנדטים"];
  const origin: Reconstruction["origin"] = {};
  if (ids.some(id => !p.values[id])) return { status: "missing", shares: null, origin, assumptions };
  const reported: Record<string, number> = {};
  for (const id of ids) {
    const v = p.values[id];
    if (v.p !== undefined) {
      if (!Number.isFinite(v.p) || v.p < 0 || v.p > 100) return { status: "conflict", shares: null, origin, assumptions };
      reported[id] = v.p;
      origin[id] = "reported";
    } else origin[id] = "reconstructed";
  }
  if (ids.every(id => origin[id] === "reported")) {
    return { status: ids.reduce((a, id) => a + reported[id], 0) > 100 ? "conflict" : "available", shares: reported, origin, assumptions: [] };
  }
  // 0 מנדטים ללא אחוז הוא חסר תמיכה, ואינו מוכנס לשחזור כאפס.
  if (ids.some(id => p.values[id].p === undefined && !p.values[id].s)) return { status: "missing", shares: null, origin, assumptions };
  const target = Object.fromEntries(ids.map(id => [id, seatsIn(p, id) ?? 0]));
  const others = (p as Poll & { others?: { pct?: number } }).others?.pct;
  if (others !== undefined) assumptions[2] = `אחרות שדווחו: ${others}%, אינן רשימה זכאית למנדטים`;
  const shares = pctForSeats(ids, target, reported, { valid: SUPPORT_RECONSTRUCTION.validVotes, agreements, others: others ?? SUPPORT_RECONSTRUCTION.othersDefaultPct, fixed: Object.keys(reported) });
  if (!shares || Object.keys(reported).some(id => shares[id] !== reported[id])) return { status: "conflict", shares: null, origin, assumptions };
  return { status: "available", shares, origin, assumptions };
}
/**
 * הכרעת הבעלים: חסר אינו חוסם נתון. משלימים מתוך תמיכה שנצפתה בסקרים האחרים באותה קבוצת קלט,
 * ורשימה שלא נשאלה בשום סקר מקבלת 0 כהנחה רשומה. אין שימוש בנתוני המודל.
 * אחוז שפורסם נשמר; התאמת מקום להשלמות נעשית רק בתמיכה המשוחזרת של רשימות עם מנדטים.
 */
export function adjustedAverage(input: Poll[], ids: string[], agreements: readonly Agreement[] = []) {
  const empirical: Record<string, number[]> = Object.fromEntries(ids.map(id => [id, []]));
  const sparse = input.map(p => {
    const r = reconstructPoll(p, Object.keys(p.values), agreements);
    const reported = Object.fromEntries(Object.entries(p.values).flatMap(([id, v]) => Number.isFinite(v.p) && v.p! >= 0 && v.p! <= 100 ? [[id, v.p!]] : []));
    const shares = r.status === "available" ? r.shares! : { ...reported };
    if (r.status !== "available") {
      const passing = Object.keys(p.values).filter(id => p.values[id].s! > 0 && p.values[id].p === undefined);
      const sum = passing.reduce((a, id) => a + p.values[id].s!, 0);
      const room = Math.max(0, 100 - Object.values(reported).reduce((a, b) => a + b, 0) - ((p as Poll & { others?: { pct?: number } }).others?.pct ?? SUPPORT_RECONSTRUCTION.othersDefaultPct));
      for (const id of passing) shares[id] = p.values[id].s! / sum * room;
    }
    for (const id of ids) if (shares[id] !== undefined) empirical[id].push(shares[id]);
    return { p, r, shares };
  });
  const observedMean = Object.fromEntries(ids.map(id => [id, empirical[id].length ? empirical[id].reduce((a, b) => a + b, 0) / empirical[id].length : 0]));
  const observations = sparse.map(({ p, r, shares: observed }) => {
    const shares: Record<string, number> = {};
    const origin: Record<string, "reported" | "reconstructed" | "imputed" | "assumed-zero"> = {};
    const assumptions = ["אין החלקה או תיקון השפעת מכון", "חסר: ממוצע תמיכה מתצפיות זמינות בקבוצת הקלט; ללא תצפית — 0 כהנחה, לא כאפס מדווח"];
    const passing = ids.filter(id => p.values[id]?.s! > 0 && p.values[id]?.p === undefined);
    for (const id of ids) {
      const v = p.values[id];
      if (Number.isFinite(v?.p) && v!.p! >= 0 && v!.p! <= 100) { shares[id] = v!.p!; origin[id] = "reported"; }
      else if (!passing.includes(id)) {
        shares[id] = observed[id] ?? observedMean[id];
        origin[id] = observed[id] !== undefined ? "reconstructed" : empirical[id].length ? "imputed" : "assumed-zero";
      }
    }
    const fixedSum = Object.values(shares).reduce((a, b) => a + b, 0);
    const reportedOthers = (p as Poll & { others?: { pct?: number } }).others?.pct;
    const others = reportedOthers ?? (passing.length ? SUPPORT_RECONSTRUCTION.othersDefaultPct : Math.max(0, 100 - fixedSum));
    assumptions.push(`אחרות: ${others}% (${reportedOthers !== undefined ? "מדווח" : passing.length ? "הנחת שחזור" : "שארית התמיכה שלא הוקצתה לרשימות"}); אינן רשימה שמקבלת מנדטים`);
    const passingRoom = Math.max(0, 100 - fixedSum - others);
    const passingSeats = passing.reduce((a, id) => a + p.values[id].s!, 0);
    // אין נרמול של אחוז מדווח. מתקנים רק את החלק שדורש שחזור ממנדטים.
    for (const id of passing) { shares[id] = passingSeats ? p.values[id].s! / passingSeats * passingRoom : 0; origin[id] = "reconstructed"; }
    if (r.status === "available" && ids.every(id => p.values[id]) && passing.length) {
      Object.assign(shares, r.shares);
      assumptions.push(...r.assumptions);
    } else if (passing.length) assumptions.push("שחזור יחסי של הרשימות עם מנדטים, לאחר שמירת התמיכה המדווחת וההשלמות; אינו שחזור ייחודי של הסקר");
    const status = Object.values(shares).reduce((a, b) => a + b, 0) > 100.000001 ? "conflict" as const : "available" as const;
    return { pollId: p.id, status, shares, origin, assumptions };
  });
  if (!input.length) return { status: "missing" as const, seats: null, shares: null, observations, allocation: null };
  // סתירה אינה מוצגת כנתון תקין; אין תיקון שקט של אחוזים שדווחו מעל 100.
  if (observations.some(o => o.status === "conflict")) return { status: "conflict" as const, seats: null, shares: null, observations, allocation: null };
  const shares = Object.fromEntries(ids.map(id => [id, observations.reduce((a, o) => a + o.shares[id], 0) / observations.length]));
  const votes = Object.fromEntries(ids.map(id => [id, Math.round(shares[id] * SUPPORT_RECONSTRUCTION.validVotes / 100)]));
  const allocation = allocate(votes, SUPPORT_RECONSTRUCTION.validVotes, agreements);
  return { status: allocation.status === "ok" ? "available" as const : "conflict" as const, seats: allocation.status === "ok" ? allocation.seats : null, shares, observations, allocation };
}
export interface DataResult {
  metricId: string; subject: { ids: string[] }; selection: Selection; value: number | null; unit: string;
  snapshotId: string; methodVersion: string; inputRefs: string[]; assumptions: string[];
  computedAt: string; latestFieldworkEnd: string | null; sourcePublishedAt: string[]; checkedAt: string[];
  status: "available" | "missing" | "conflict" | "unsupported"; quality: { verified: number; total: number; reconstructed: boolean; imputed: boolean; fieldConflicts: number };
  evidenceId: string; label: string; explain: string; method: string; range: [number, number] | null; values?: number[];
}
export interface ProviderInput {
  polls: Poll[];
  meta: { dataAsOf: string; agreements2026: { pair: [string, string] }[] };
  lists2026: { id: string; name: string }[];
  model: { asof: string; lastPoll: string; polls: number; pollsters: number; central: { seats: Record<string, number>; shares: Record<string, number> } };
}
export function createDataProvider({ polls, meta, lists2026, model }: ProviderInput) {
  const usablePolls = polls.filter(p => p.eligibleToShow);
  const SOURCE_OPTIONS = sourceOptions(usablePolls);
  const MODEL_AVERAGE = { ...model.central, asOf: model.asof, lastPoll: model.lastPoll, polls: model.polls, pollsters: model.pollsters };
  const DATA_AS_OF = MODEL_AVERAGE.asOf;
  const SNAPSHOT_ID = `polls-${identity({ polls, meta, model, method: METHOD_VERSION, reconstruction: SUPPORT_RECONSTRUCTION })}`;
  const latestPerPollster = (asOf: string, days = POLL_WINDOW_DAYS) => bucketLatest(usablePolls, p => p.end, pollsterKey, toTime(asOf), days);
  const CURRENT_POLLS = latestPerPollster(DATA_AS_OF, POLL_WINDOW_DAYS);
  const SIMPLE_POLL_MEANS = Object.fromEntries(lists2026.flatMap(({ id }) => {
    const s = pollSeatSummary(CURRENT_POLLS, [id]); return [[id, s?.mean ?? 0]];
  }));
  const AGREEMENTS = meta.agreements2026.map(a => a.pair as Agreement);
  const adjusted = adjustedAverage(CURRENT_POLLS, lists2026.map(l => l.id), AGREEMENTS);
  const ADJUSTED_AVERAGE = adjusted;
  const completionCache = new Map<string, ReturnType<typeof adjustedAverage>>();
  const completedFor = (selection: Selection) => {
    if (!selection.firms && !selection.publishers && selection.product !== "poll.single" && (selection.asOf ?? DATA_AS_OF) === DATA_AS_OF && (selection.days ?? POLL_WINDOW_DAYS) === POLL_WINDOW_DAYS) return adjusted;
    const key = identity(selection);
    let result = completionCache.get(key);
    if (!result) { result = adjustedAverage(selectedPolls(selection), lists2026.map(l => l.id), AGREEMENTS); completionCache.set(key, result); }
    return result;
  };
function resolveData(selection: Selection, ids: string[], screen: DataScreen = "method"): DataResult {
  const definition = DATA_PRODUCTS[selection.product];
  const members = [...new Set(ids)].sort();
  const normalized = { ...selection, asOf: selection.asOf ?? DATA_AS_OF, days: selection.days ?? POLL_WINDOW_DAYS };
  const input = selectedPolls(normalized);
  const completed = selection.firms || selection.publishers ? completedFor(selection) : adjusted;
  const option = SOURCE_OPTIONS.find(o => o.id === selection.source);

  const summary = pollSeatSummary(input, members);
  let status: DataResult["status"] = sourceAllowed(screen, selection.product) && (!(selection.firms || selection.publishers) || ["polls.mean", "polls.adjusted"].includes(selection.product)) ? "available" : "unsupported";
  let value: number | null = null;
  let assumptions: string[] = [definition.assumption, ...(selection.publishers ? [`מזמינים נבחרים בלבד: ${selection.publishers.join(", ")}; משקל שווה לסדרה האחרונה בחלון`] : []), ...(selection.firms ? ["ממוצע אישי: רק המכונים שנבחרו; משקל שווה לכל סדרת מכון–מזמין אחרונה בחלון"] : [])];
  if (status === "available") {
    if (selection.product === "polls.mean" || selection.product === "poll.single") value = summary?.mean ?? (input.length ? 0 : null);
    else if (normalized.asOf !== DATA_AS_OF || normalized.days !== POLL_WINDOW_DAYS || selection.source) status = "unsupported";
    else {
      const values = selection.product === "model.mean" ? model.central.seats : completed.seats;
      if (selection.product === "polls.adjusted") {
        status = completed.status;
        assumptions = [...assumptions, ...new Set(completed.observations.flatMap(o => o.assumptions))];
      }
      // מדד קבוצה: סכום ערכים קיימים בלבד, לפי המדיניות הרשומה.
      value = sumPresent(members.map(id => values?.[id]));
    }
  }
  if (status === "available" && value === null) status = "missing";
  const inputRefs = selection.product === "model.mean" ? ["src/data/model.json"] : input.map(p => p.id);
  const evidenceId = identity({ metricId: `${selection.product}.seats`, members, normalized, snapshot: SNAPSHOT_ID, method: METHOD_VERSION, screen });
  return { metricId: `${selection.product}.seats`, subject: { ids: members }, selection: normalized, value: status === "available" ? value : null, unit: definition.unit, snapshotId: SNAPSHOT_ID, methodVersion: METHOD_VERSION, inputRefs, assumptions, computedAt: meta.dataAsOf, latestFieldworkEnd: selection.product === "model.mean" ? model.lastPoll : input.map(p => p.end).sort().slice(-1)[0] ?? null, sourcePublishedAt: input.flatMap(p => p.verification?.details.published ? [p.verification.details.published] : []), checkedAt: input.flatMap(p => p.verification?.checkedAt ? [p.verification.checkedAt] : []), status, quality: { verified: input.filter(p => p.verified).length, total: input.length, imputed: selection.product === "polls.adjusted" && completed.observations.some(o => Object.values(o.origin).some(x => x === "imputed" || x === "assumed-zero")), fieldConflicts: input.filter(p => Object.values(p.fieldChecks ?? {}).some(f => f.status === "conflict")).length, reconstructed: selection.product === "polls.adjusted" && completed.observations.some(o => Object.values(o.origin).includes("reconstructed")) }, evidenceId, label: option && selection.product === "poll.single" ? option.label : definition.name + (selection.firms ? " — אישי" : ""), explain: option && selection.product === "poll.single" ? option.explain : definition.explain, method: definition.method, range: (selection.product === "polls.mean" || selection.product === "poll.single") ? summary?.range ?? (input.length ? [0, 0] : null) : null };
}
function resolveDataset(selection: Selection, screen: DataScreen = "method") {
  const rows = lists2026.map(l => resolveData(selection, [l.id], screen));
  return { selection, snapshotId: SNAPSHOT_ID, rows, seats: Object.fromEntries(rows.filter(r => r.value !== null).map(r => [r.subject.ids[0], r.value!])), shares: rows.some(r => r.status === "available") ? resolveSupport(selection).shares : null };
}
/** בגושים פונים עם הרכב מלא; אין סכימת ממוצעי מפלגות בעלי מכנים שונים. */
const resolveBloc = resolveData;

/** אחוז תמיכה אינו מנדטים / 120. כל תצפית מסומנת כמדווחת או משוחזרת. */
function resolveSupport(selection: Selection) {
  if (selection.product === "model.mean") return { shares: MODEL_AVERAGE.shares, origin: "model" as const };
  if (selection.product === "polls.adjusted") { const completed = completedFor(selection); return { shares: completed.status === "available" ? completed.shares : null, origin: "reconstructed" as const }; }
  const observations = completedFor(selection).observations;
  const shares: Record<string, number> = {};
  for (const { id } of lists2026) {
    const values = observations.flatMap(o => o.status === "available" && o.shares?.[id] !== undefined ? [o.shares[id]] : []);
    if (values.length) shares[id] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  return { shares, origin: "reported-or-reconstructed" as const };
}
function selectedPolls(selection: Selection): Poll[] {
  let input = latestPerPollster(selection.asOf ?? DATA_AS_OF, selection.days ?? POLL_WINDOW_DAYS);
  if (selection.firms) input = input.filter(p => selection.firms!.includes(p.firm));
  if (selection.publishers) input = input.filter(p => p.publisher !== null && selection.publishers!.includes(p.publisher));
  if (selection.product !== "poll.single") return input;
  const option = SOURCE_OPTIONS.find(o => o.id === selection.source);
  if (!option && selection.source?.startsWith("firm:")) return input.filter(p => p.firm === selection.source!.slice(5));
  return option ? input.filter(p => p.firm === option.firmId && (!option.seriesId || pollsterKey(p) === option.seriesId)) : [];
}

function resolveSupportMetric(selection: Selection, ids: string[], screen: DataScreen = "method"): DataResult {
  const result = resolveData(selection, ids, screen);
  if (result.status === "unsupported") return { ...result, metricId: `${selection.product}.support`, unit: "אחוזים", range: null };
  const shares = resolveSupport(selection).shares;
  const available = shares && result.subject.ids.every(id => Number.isFinite(shares[id]));
  let range: [number, number] | null = null;
  let values: number[] = [];
  if ((selection.product === "polls.mean" || selection.product === "poll.single") && available) {
    const observations = completedFor(selection).observations;
    values = observations.filter(o => o.status === "available").map(o => result.subject.ids.reduce((a, id) => a + o.shares[id], 0));
    if (values.length) range = [Math.min(...values), Math.max(...values)];
  }
  return { ...result, metricId: `${selection.product}.support`, unit: "אחוזים", range, values, assumptions: [...result.assumptions, "אחוזי תמיכה שפורסמו או שוחזרו והושלמו לפי המדיניות; אינם מנדטים חלקי 120"], value: available ? result.subject.ids.reduce((a, id) => a + shares![id], 0) : null, status: available ? "available" : "missing", evidenceId: identity({ base: result.evidenceId, measure: "support" }) };
}

function resolveMetric(request: { selection: Selection; ids: string[]; screen?: DataScreen; measure?: "seats" | "support"; operation?: "difference" | "majorityGap"; compareTo?: { selection: Selection; ids: string[] } }): DataResult {
  const resolve = request.measure === "support" ? resolveSupportMetric : resolveData;
  const left = resolve(request.selection, request.ids, request.screen);
  if (!request.operation) return left;
  const right = request.compareTo ? resolve(request.compareTo.selection, request.compareTo.ids, request.screen) : null;
  const valid = left.status === "available" && (request.operation !== "difference" || right?.status === "available") && !(request.operation === "majorityGap" && request.measure === "support");
  return { ...left, metricId: `${request.operation}.${left.metricId}`, value: valid ? request.operation === "majorityGap" ? Math.max(0, MAJORITY_SEATS - left.value!) : left.value! - right!.value! : null, range: null, status: valid ? "available" : "missing", method: "means", inputRefs: [...new Set([...left.inputRefs, ...(right?.inputRefs ?? [])])], assumptions: [...left.assumptions, ...(right?.assumptions ?? []), request.operation === "majorityGap" ? "פער לרוב: 61 פחות הנתון, ולא פחות מאפס" : "הפרש: צד ראשון פחות צד שני באותה יחידה"], evidenceId: identity({ left: left.evidenceId, right: right?.evidenceId, operation: request.operation }) };
}

return { MODEL_AVERAGE, DATA_AS_OF, SNAPSHOT_ID, CURRENT_POLLS, SIMPLE_POLL_MEANS, SOURCE_OPTIONS, ADJUSTED_AVERAGE, resolveData, resolveDataset, resolveBloc, resolveSupport, resolveSupportMetric, resolveMetric, selectedPolls };
}
