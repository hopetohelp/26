/**
 * חלוקת המנדטים לפי חוק הבחירות לכנסת [נוסח משולב], התשכ"ט-1969:
 *   סעיף 81(א)  — סף: לפחות 3.25% מהקולות הכשרים.
 *   סעיף 81(ב)  — המודד: "המספר השלם היוצא מן החילוק" של קולות הרשימות המשתתפות ב-120.
 *   סעיף 81(ג)  — מנדטים שלמים לכל רשימה בנפרד.
 *   סעיף 81(ד)  — עודפים: המנה (קולות ÷ (מנדטים + 1)) הגדולה זוכה; שוויון — הגרלה של הוועדה;
 *                 81(ד)(4): רשימה שלא קיבלה יותר ממחצית הקולות וזכתה במחצית המנדטים יוצאת מחלוקת העודפים.
 *   סעיף 82(א)  — זוג בהסכם עודפים נחשב רשימה אחת רק לעניין 81(ד), ובלבד ששתיהן עברו את הסף.
 *   סעיף 82(ב)  — חלוקה פנימית בזוג "לפי שיטת החלוקה הקבועה בסעיף 81".
 *
 * כל ההשוואות בשלמים (BigInt) — בלי שגיאות נקודה צפה.
 */

export type Agreement = readonly [string, string];

export interface TraceStep {
  /** מספר המנדט העודף (1 = העודף הראשון) */
  step: number;
  /** הרשימה או הזוג שזכו ("א+ב" לזוג) */
  unit: string;
  /** המנה שבזכותה זכו: קולות ÷ (מנדטים לפני הזכייה + 1) */
  quotient: number;
}

export interface InactiveAgreement {
  pair: Agreement;
  reason: string;
}

export interface AllocationResult {
  status: "ok" | "lottery_required" | "invalid_input";
  error?: string;
  seats: Record<string, number>;
  passing: string[];
  quota: number;
  passingTotal: number;
  thresholdVotes: number;
  wasted: number;
  whole: Record<string, number>;
  trace: TraceStep[];
  /** כשנדרשת הגרלה: מספר המנדט והיחידות השוות. ההקצאה נעצרת שם (תוצאה חלקית). */
  tie?: { step: number; units: string[] };
  activeAgreements: Agreement[];
  inactiveAgreements: InactiveAgreement[];
}

export interface AllocationOptions {
  seats?: number;
  /** סף באלפיות האחוז: 3250 = 3.25% */
  thresholdMilli?: number;
}

const big = (n: number) => BigInt(Math.round(n));

function emptyResult(error: string): AllocationResult {
  return {
    status: "invalid_input", error, seats: {}, passing: [], quota: 0, passingTotal: 0,
    thresholdVotes: 0, wasted: 0, whole: {}, trace: [], activeAgreements: [], inactiveAgreements: [],
  };
}

/** משווה a1/b1 מול a2/b2 (שלמים חיוביים) */
function cmpFrac(a1: bigint, b1: bigint, a2: bigint, b2: bigint): number {
  const l = a1 * b2;
  const r = a2 * b1;
  return l > r ? 1 : l < r ? -1 : 0;
}

interface Unit {
  key: string;
  votes: bigint;
  seats: number;
}

/**
 * מחלק `total` מנדטים בין יחידות לפי 81(ד), החל ממנדטים התחלתיים.
 * מחזיר null בשוויון (עם פרטי השוויון), אחרת את המסלול.
 */
function distributeRemainder(
  units: Unit[], total: number, totalVotes: bigint, trace: TraceStep[] | null,
): { tie?: { step: number; units: string[] } } {
  let assigned = units.reduce((s, u) => s + u.seats, 0);
  let step = 0;
  const excluded = new Set<string>();
  while (assigned < total) {
    step += 1;
    for (const u of units) {
      // 81(ד)(4): לא יותר ממחצית הקולות + זכתה במחצית המנדטים ⇐ יוצאת
      if (u.votes * 2n <= totalVotes && u.seats * 2 >= total) excluded.add(u.key);
    }
    const cands = units.filter((u) => !excluded.has(u.key));
    if (cands.length === 0) return { tie: { step, units: [] } };
    let best: Unit[] = [cands[0]];
    for (const u of cands.slice(1)) {
      const c = cmpFrac(u.votes, BigInt(u.seats + 1), best[0].votes, BigInt(best[0].seats + 1));
      if (c > 0) best = [u];
      else if (c === 0) best.push(u);
    }
    if (best.length > 1) return { tie: { step, units: best.map((u) => u.key).sort() } };
    const w = best[0];
    trace?.push({ step, unit: w.key, quotient: Number(w.votes) / (w.seats + 1) });
    w.seats += 1;
    assigned += 1;
  }
  return {};
}

export function allocate(
  votes: Record<string, number>,
  valid: number,
  agreements: readonly Agreement[] = [],
  options: AllocationOptions = {},
): AllocationResult {
  const totalSeats = options.seats ?? 120;
  const thrMilli = options.thresholdMilli ?? 3250;
  if (!Number.isFinite(valid) || valid <= 0) return emptyResult("סך הקולות הכשרים חייב להיות חיובי");
  for (const [k, v] of Object.entries(votes)) {
    if (!Number.isFinite(v) || v < 0 || Math.round(v) !== v) return emptyResult(`מספר קולות לא תקין לרשימה ${k}`);
  }
  const listSum = Object.values(votes).reduce((a, b) => a + b, 0);
  if (listSum > valid) return emptyResult("סכום הקולות לרשימות גדול מסך הקולות הכשרים");

  // אימות ההסכמים: זוגות זרים, בלי רשימה עם עצמה, רק רשימות קיימות
  const partner = new Map<string, string>();
  for (const [a, b] of agreements) {
    if (a === b) return emptyResult(`הסכם של רשימה עם עצמה: ${a}`);
    if (!(a in votes) || !(b in votes)) return emptyResult(`הסכם עם רשימה שאינה קיימת: ${a}+${b}`);
    if (partner.has(a) || partner.has(b)) return emptyResult(`רשימה בשני הסכמים: ${a}+${b}`);
    partner.set(a, b);
    partner.set(b, a);
  }

  const V = big(valid);
  const thrNum = BigInt(thrMilli);
  // 81(א): קולות ≥ 3.25% מהכשרים  ⇔  קולות × 100000 ≥ סף_באלפיות × כשרים
  const passing = Object.keys(votes).filter((k) => big(votes[k]) * 100000n >= thrNum * V);
  const passingSet = new Set(passing);
  const passingTotal = passing.reduce((s, k) => s + big(votes[k]), 0n);
  const quota = passingTotal / BigInt(totalSeats); // 81(ב): חלק שלם
  const thresholdVotes = (thrMilli / 100000) * valid;
  if (quota === 0n) return emptyResult("המודד יוצא אפס — מעט מדי קולות לחלוקה");

  const whole: Record<string, number> = {};
  for (const k of passing) whole[k] = Number(big(votes[k]) / quota);
  const wholeSum = Object.values(whole).reduce((a, b) => a + b, 0);
  if (wholeSum > totalSeats) return emptyResult("סכום המנדטים השלמים עולה על מספר המושבים — קלט מלאכותי");

  const active: Agreement[] = [];
  const inactive: InactiveAgreement[] = [];
  for (const [a, b] of agreements) {
    if (passingSet.has(a) && passingSet.has(b)) active.push([a, b]);
    else {
      const failed = [a, b].filter((x) => !passingSet.has(x)).join(" ו-");
      inactive.push({ pair: [a, b], reason: `${failed} לא עבר/ה את אחוז החסימה` });
    }
  }
  const inPair = new Set(active.flat());
  const units: Unit[] = passing
    .filter((k) => !inPair.has(k))
    .map((k) => ({ key: k, votes: big(votes[k]), seats: whole[k] }));
  for (const [a, b] of active) {
    units.push({ key: `${a}+${b}`, votes: big(votes[a]) + big(votes[b]), seats: whole[a] + whole[b] });
  }
  units.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0)); // אי-תלות בסדר הקלט

  const trace: TraceStep[] = [];
  const res = distributeRemainder(units, totalSeats, passingTotal, trace);
  const seats: Record<string, number> = {};
  for (const k of Object.keys(votes)) seats[k] = 0;
  const pairKeys = new Set(active.map(([a, b]) => `${a}+${b}`));
  for (const u of units) if (!pairKeys.has(u.key)) seats[u.key] = u.seats;

  const base: AllocationResult = {
    status: "ok", seats, passing: [...passing].sort(), quota: Number(quota), passingTotal: Number(passingTotal),
    thresholdVotes, wasted: valid - Number(passingTotal), whole, trace, activeAgreements: active,
    inactiveAgreements: inactive,
  };
  if (res.tie) return { ...base, status: "lottery_required", tie: res.tie };

  // 82(ב): חלוקה פנימית בכל זוג לפי שיטת סעיף 81
  for (const [a, b] of active) {
    const unit = units.find((u) => u.key === `${a}+${b}`)!;
    const S = unit.seats;
    const pairVotes = big(votes[a]) + big(votes[b]);
    const pq = pairVotes / BigInt(S);
    const inner: Unit[] = [
      { key: a, votes: big(votes[a]), seats: Number(big(votes[a]) / pq) },
      { key: b, votes: big(votes[b]), seats: Number(big(votes[b]) / pq) },
    ].sort((x, y) => (x.key < y.key ? -1 : 1));
    const r = distributeRemainder(inner, S, pairVotes, null);
    if (r.tie) return { ...base, status: "lottery_required", tie: { step: -1, units: r.tie.units } };
    for (const u of inner) seats[u.key] = u.seats;
  }
  return base;
}

/** ההפרש בין חלוקה עם כל ההסכמים לבין חלוקה בלי אף הסכם (נגד-עובדתי "כולם מול אף אחד") */
export function agreementsEffect(
  votes: Record<string, number>, valid: number, agreements: readonly Agreement[], options?: AllocationOptions,
): Record<string, number> {
  const withA = allocate(votes, valid, agreements, options);
  const without = allocate(votes, valid, [], options);
  const diff: Record<string, number> = {};
  for (const k of Object.keys(votes)) {
    const d = (withA.seats[k] ?? 0) - (without.seats[k] ?? 0);
    if (d !== 0) diff[k] = d;
  }
  return diff;
}

/**
 * כמה קולות צריך להוסיף לרשימה (כשכל השאר קבועות, וסך הכשרים גדל בהתאם) כדי שתקבל מנדט נוסף.
 * חיפוש בינארי עם אימות מקומי; אם האימות נכשל — סריקה גסה. מחזיר null אם אין תשובה בתחום.
 */
export function votesToNextSeat(
  votes: Record<string, number>, valid: number, list: string, agreements: readonly Agreement[] = [],
  options?: AllocationOptions,
): number | null {
  const base = allocate(votes, valid, agreements, options).seats[list] ?? 0;
  const gains = (x: number) => {
    const v = { ...votes, [list]: votes[list] + x };
    const r = allocate(v, valid + x, agreements, options);
    return r.status !== "invalid_input" && (r.seats[list] ?? 0) > base;
  };
  let hi = Math.max(1000, Math.round(valid * 0.05));
  if (!gains(hi)) return null;
  let lo = 0;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (gains(mid)) hi = mid;
    else lo = mid;
  }
  if (gains(hi) && !gains(hi - 1)) return hi;
  // אימות נכשל (אי-מונוטוניות): סריקה גסה מלמטה
  const stepSize = Math.max(1, Math.round(hi / 200));
  for (let x = stepSize; x <= hi; x += stepSize) if (gains(x)) return x;
  return hi;
}
