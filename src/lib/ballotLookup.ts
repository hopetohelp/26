import { flow, newName, oldName, SAME } from "./voterFlow";
import { largestRemainder } from "./fillAll";

/** public/flow-units.json: מספר, מרכז קלפיות, בעלי זכות, מצביעים, קולות לפי letters. */
export type Ballot = [string, string, number, number, ...number[]];
export interface BallotPlace { name: string; y22: Ballot[]; y26: Ballot[] }
export interface BallotUnits { letters22: string[]; letters26: string[]; places: Record<string, BallotPlace> }
export interface BallotLocations { about: { year: number; source: string; snapshot: string }; locations: Record<string, { venue: string; address: string; center: string; eligible: number }>; locations22?: Record<string, string> }
export interface BallotFilter { city: string; ballot: string; sub: string }
export interface BallotOption { id: string; code: string; number: string; place: string; location: string }

const normalize = (s: string) => s.trim().replace(/[־–—-]/g, " ").replace(/\s+/g, " ");
const baseNumber = (s: string) => s.split(".")[0];
const subNumber = (s: string) => s.split(".")[1] ?? "";
const numericOrder = (a: string, b: string) => a.localeCompare(b, "he", { numeric: true });

export function matchingPlaces(units: BallotUnits, city: string, preferExact = true): [string, BallotPlace][] {
  const all = Object.entries(units.places), query = normalize(city);
  const exact = all.filter(([, p]) => normalize(p.name) === query);
  return preferExact && exact.length ? exact : all.filter(([, p]) => normalize(p.name).includes(query));
}

/** רשימת ההצעות אינה נחתכת: גם כשיש התאמה מדויקת מציעים את כל ההמשכים. */
export function ballotOptions(places: [string, BallotPlace][], query: string, locations?: BallotLocations, sub = ""): BallotOption[] {
  const addresses = new Map<string, Set<string>>();
  for (const [key, address] of Object.entries(locations?.locations ?? {})) {
    const [code, fullNumber] = key.split(":"), base = baseNumber(fullNumber);
    if (sub && subNumber(fullNumber) !== sub.trim()) continue;
    const id = `${code}:${base}`;
    if (!addresses.has(id)) addresses.set(id, new Set());
    addresses.get(id)!.add([address.venue, address.address].filter(Boolean).join(" · "));
  }
  return places.flatMap(([code, p]) => {
    const grouped = new Map<string, Set<string>>();
    for (const row of [...p.y26, ...p.y22]) {
      const number = baseNumber(row[0]);
      if (!number.startsWith(query.trim())) continue;
      if (sub && subNumber(row[0]) !== sub.trim()) continue;
      if (!grouped.has(number)) grouped.set(number, new Set());
      const current = addresses.get(`${code}:${number}`), old = locations?.locations22?.[`${code}:${Number(row[0])}`];
      const texts = code === "9999" ? ["מעטפות כפולות — ללא מיקום גאוגרפי"] : current ? [...current] : [old ? `${old} (2022)` : `מרכז קלפיות ${row[1]} (2022)`];
      for (const text of texts) grouped.get(number)!.add(text);
    }
    return [...grouped].map(([number, centers]) => ({
      id: `${code}:${number}`, code, number, place: p.name,
      location: [...centers].sort(numericOrder).join(" / "),
    }));
  }).sort((a, b) => a.place.localeCompare(b.place, "he") || numericOrder(a.number, b.number));
}

export function subOptions(places: [string, BallotPlace][], ballot: string): string[] {
  return [...new Set(places.flatMap(([, p]) => [...p.y26, ...p.y22])
    .filter((r) => baseNumber(r[0]) === ballot.trim()).map((r) => subNumber(r[0])).filter(Boolean))].sort(numericOrder);
}

/** הסינון נקבע על פני כל היישובים המתאימים לפני פירוק ליישובים, גם בהקלדה חלקית. */
function selectedPlaces(units: BallotUnits, filter: BallotFilter) {
  const places = matchingPlaces(units, filter.city), number = filter.ballot.trim(), sub = filter.sub.trim();
  const exact = places.some(([, p]) => [...p.y26, ...p.y22].some((r) => baseNumber(r[0]) === number));
  const match = (r: Ballot) => (!number || (exact ? baseNumber(r[0]) === number : baseNumber(r[0]).startsWith(number)))
    && (!sub || subNumber(r[0]) === sub);
  return places.map(([code, p]) => ({ code, p, y22: p.y22.filter(match), y26: p.y26.filter(match) }));
}

/** שדה ריק משאיר את רמת הסינון שמעליו. מספר שלם כולל את כל תתי הקלפי. */
export function filterBallots(units: BallotUnits, filter: BallotFilter) {
  const places = selectedPlaces(units, filter);
  return { y22: places.flatMap((p) => p.y22), y26: places.flatMap((p) => p.y26) };
}

type ComparisonLevel = "exact" | "ballot" | "city";
interface ComparisonGroup { old: Ballot[]; current: Ballot[]; level: ComparisonLevel; estimated: boolean }

/** יחידת ההשוואה הקטנה ביותר הזמינה: תת קלפי, קלפי שלמה, עיר — לפי בקשת הבעלים 29/10. */
function comparisonGroups(units: BallotUnits, filter: BallotFilter): ComparisonGroup[] {
  return selectedPlaces(units, filter).flatMap<ComparisonGroup>(({ p, y22, y26 }) => {
    if (!filter.ballot.trim()) return [{ old: y22, current: y26, level: "city", estimated: false }];
    const keys = [...new Set(y26.map((r) => filter.sub.trim() ? r[0] : baseNumber(r[0])))];
    return keys.map<ComparisonGroup>((key) => {
      const current = y26.filter((r) => (filter.sub.trim() ? r[0] : baseNumber(r[0])) === key);
      const exact = p.y22.filter((r) => filter.sub.trim() ? Number(r[0]) === Number(key) : baseNumber(r[0]) === key);
      if (exact.length) return { old: exact, current, level: "exact", estimated: false };
      const parent = filter.sub.trim() ? p.y22.filter((r) => baseNumber(r[0]) === baseNumber(key)) : [];
      return { old: parent.length ? parent : p.y22, current, level: parent.length ? "ballot" : "city", estimated: true };
    });
  });
}

export interface BallotComparisonStatus {
  level: ComparisonLevel | "unavailable";
  label: string;
  reason: string;
  exactBallots: number;
  totalBallots: number;
}

/** "מדויק" הוא התאמת מספרי היחידה בתוך אותו יישוב, ולא ידיעה איך הצביע כל אדם. */
export function ballotComparisonStatus(units: BallotUnits, filter: BallotFilter): BallotComparisonStatus {
  const places = matchingPlaces(units, filter.city), selected = filterBallots(units, filter);
  let totalBallots = 0, exactBallots = 0;
  for (const [, p] of places) {
    const old = new Set(p.y22.map((r) => baseNumber(r[0]))), current = new Set(p.y26.map((r) => baseNumber(r[0])));
    totalBallots += current.size;
    exactBallots += [...current].filter((n) => old.has(n)).length;
  }
  const counts = { totalBallots, exactBallots };
  if (!selected.y26.length) return { ...counts, level: "unavailable", label: "אין השוואה", reason: "אין נתוני 2026 ליחידה שנבחרה בקובץ התוצאות" };
  if (!filter.ballot.trim()) {
    const exactPercent = totalBallots ? Math.round(exactBallots / totalBallots * 100) : 0;
    return { ...counts, level: "city", label: `(${exactPercent}% לפי הקלפי, ${100 - exactPercent}% לפי היישוב)`, reason: "" };
  }
  const groups = comparisonGroups(units, filter);
  if (groups.some((g) => g.estimated && !g.old.some((r) => r[2] > 0))) return { ...counts, level: "unavailable", label: "אין השוואה", reason: "אין נתוני בעלי זכות בחירה ב־2022 לחישוב אומדן" };
  const hasSub = !!filter.sub.trim();
  if (groups.some((g) => g.level === "city")) return { ...counts, level: "city", label: "לפי עיר", reason: hasSub ? "תת קלפי וקלפי שלמה חדשות" : "קלפי חדשה" };
  if (groups.some((g) => g.level === "ballot")) return { ...counts, level: "ballot", label: "לפי קלפי", reason: "תת קלפי חדשה" };
  return { ...counts, level: "exact", label: "מדויק", reason: hasSub ? "מספר תת קלפי זהה" : "מספר קלפי שלמה זהה" };
}

/** נתוני 2022 של ההורה מותאמים לבעלי הזכות ביחידה שנבחרה ב־2026; הקולות מעוגלים בשארית הגדולה. */
function estimateBaseline(old: Ballot[], current: Ballot[], letters: string[]): Ballot | null {
  const sourceEligible = old.reduce((s, r) => s + r[2], 0), eligible = current.reduce((s, r) => s + r[2], 0);
  if (sourceEligible <= 0) return null;
  const ratio = eligible / sourceEligible;
  const voters = Math.round(old.reduce((s, r) => s + r[3], 0) * ratio);
  const weights = Object.fromEntries(letters.map((l, k) => [l, sumBallotVotes(old, [k])]));
  const valid = Math.round(Object.values(weights).reduce((s, v) => s + v, 0) * ratio);
  const votes = largestRemainder(valid, weights);
  return [current[0][0], current[0][1], eligible, voters, ...letters.map((l) => votes[l])];
}

export function comparisonBallots(units: BallotUnits, filter: BallotFilter) {
  const selected = filterBallots(units, filter), status = ballotComparisonStatus(units, filter);
  if (!filter.ballot.trim() || !selected.y26.length) return { ...selected, estimated: false, status };
  const groups = comparisonGroups(units, filter);
  const baseline: Ballot[] = [];
  for (const g of groups) {
    if (!g.estimated) baseline.push(...g.old);
    else {
      const row = estimateBaseline(g.old, g.current, units.letters22);
      // אין להציג בסיס חלקי כבסיס של כל היחידות שנבחרו.
      if (!row) return { y22: [], y26: selected.y26, estimated: false, status };
      baseline.push(row);
    }
  }
  return { y22: baseline, y26: selected.y26, estimated: groups.some((g) => g.estimated), status };
}

export const sumBallotVotes = (rows: Ballot[], indexes: number[]) => rows.reduce((sum, r) => sum + indexes.reduce((s, k) => s + (r[4 + k] as number), 0), 0);
export const validBallotVotes = (rows: Ballot[], count: number) => sumBallotVotes(rows, Array.from({ length: count }, (_, k) => k));
export const ballotShare = (votes: number, total: number): number | null => total > 0 ? votes / total * 100 : null;
export function ballotSummary(rows: Ballot[], letters: string[]) {
  const eligible = rows.reduce((s, r) => s + r[2], 0), voters = rows.reduce((s, r) => s + r[3], 0);
  const valid = validBallotVotes(rows, letters.length);
  return { eligible, voters, valid, turnout: ballotShare(voters, eligible), validShare: ballotShare(valid, voters), present: rows.length > 0 };
}

/** הרשימות בפועל, לפי SAME במסך המעברים; אין חלוקה מומצאת של רשימה שהתפצלה. */
export function ballotPartyRows(units: BallotUnits, rows22: Ballot[], rows26: Ballot[]) {
  const used = new Set<string>();
  const at22 = (l: string) => sumBallotVotes(rows22, [units.letters22.indexOf(l)]);
  const image22: Record<string, string> = { "כן": "bluewhite" };
  const result = units.letters26.map((letter, k) => {
    const id = flow.letters26[letter] ?? letter, previous = letter === "other" ? "other" : SAME[id];
    if (previous) used.add(previous);
    return { id, letters: letter, name: newName(id), previousName: previous ? oldName(previous) : undefined, image: id,
      votes22: previous && units.letters22.includes(previous) && rows22.length ? at22(previous) : null,
      votes26: rows26.length ? sumBallotVotes(rows26, [k]) : null };
  });
  for (const letter of units.letters22.filter((l) => !used.has(l))) {
    result.push({ id: `2022:${letter}`, letters: letter, name: oldName(letter), previousName: undefined, image: image22[letter] ?? "",
      votes22: rows22.length ? at22(letter) : null, votes26: null });
  }
  return result.filter((r) => (r.votes22 ?? 0) > 0 || (r.votes26 ?? 0) > 0)
    .sort((a, b) => (b.votes26 ?? 0) - (a.votes26 ?? 0) || (b.votes22 ?? 0) - (a.votes22 ?? 0));
}

export type LookupLevel = "city" | "ballot" | "sub";
export type LookupSort = "name" | "voters" | "turnout";
export interface SubBallotOption extends BallotOption { fullNumber: string; sub: string }
export interface LookupScope {
  id: string; code: string; city: string; ballot: string; sub: string; label: string; location: string;
  voters: number | null; turnout: number | null;
}

/** כל תתי הקלפיות המתאימות, עם יישוב ומיקום כדי שמספר חוזר לא יתערבב בין ערים. */
export function subBallotOptions(places: [string, BallotPlace][], ballot: string, query: string, locations?: BallotLocations): SubBallotOption[] {
  const exactBase = places.some(([, p]) => [...p.y26, ...p.y22].some((r) => baseNumber(r[0]) === ballot.trim()));
  return places.flatMap(([code, p]) => {
    const rows = new Map<string, Ballot>();
    for (const row of [...p.y22, ...p.y26]) {
      const fullNumber = String(Number(row[0])), number = baseNumber(fullNumber), sub = subNumber(fullNumber);
      if (!sub || !sub.startsWith(query.trim()) || (ballot.trim() && (exactBase ? number !== ballot.trim() : !number.startsWith(ballot.trim())))) continue;
      rows.set(fullNumber, row);
    }
    return [...rows].map(([fullNumber, row]) => {
      const address = locations?.locations[`${code}:${fullNumber}`], old = locations?.locations22?.[`${code}:${fullNumber}`];
      return { id: `${code}:${fullNumber}`, code, place: p.name, number: baseNumber(fullNumber), fullNumber, sub: subNumber(fullNumber),
        location: code === "9999" ? "מעטפות כפולות — ללא מיקום גאוגרפי" : address ? [address.venue, address.address].filter(Boolean).join(" · ") : old ? `${old} (2022)` : `מרכז קלפיות ${row[1]} (2022)` };
    });
  }).sort((a, b) => a.place.localeCompare(b.place, "he") || numericOrder(a.fullNumber, b.fullNumber));
}

/** בחירת ״הכל״ מייצרת רשומות נפרדות, ולא טבלת סכום משותפת של היחידות. */
export function lookupScopes(units: BallotUnits, filter: BallotFilter, level: LookupLevel, locations?: BallotLocations): LookupScope[] {
  const places = matchingPlaces(units, filter.city), byCode = new Map(places);
  const summary = (rows: Ballot[]) => {
    const s = ballotSummary(rows, units.letters26);
    return { voters: s.present ? s.voters : null, turnout: s.turnout };
  };
  if (level === "city") return places.map(([code, p]) => ({ id: `city:${code}`, code, city: p.name, ballot: "", sub: "", label: p.name, location: "", ...summary(p.y26) }));
  // אינדקס אחד לכל רמת מיון, כדי שרשימה ארצית לא תסרוק את כל הקלפיות לכל כרטיס.
  const current = new Map<string, Ballot[]>();
  for (const [code, p] of places) for (const row of p.y26) {
    const key = `${code}:${level === "ballot" ? baseNumber(row[0]) : String(Number(row[0]))}`;
    if (!current.has(key)) current.set(key, []);
    current.get(key)!.push(row);
  }
  if (level === "ballot") return ballotOptions(places, filter.ballot, locations).map((o) => ({
    id: `ballot:${o.id}`, code: o.code, city: o.place, ballot: o.number, sub: "", label: `${o.place} · קלפי ${o.number}`, location: o.location,
    ...summary(current.get(o.id) ?? []),
  }));
  return subBallotOptions(places, filter.ballot, filter.sub, locations).filter((o) => byCode.has(o.code)).map((o) => ({
    id: `sub:${o.id}`, code: o.code, city: o.place, ballot: o.number, sub: o.sub, label: `${o.place} · תת קלפי ${o.fullNumber}`, location: o.location,
    ...summary(current.get(o.id) ?? []),
  }));
}

/** מספר מצביעים ואחוז הצבעה לפי 2026, מהגבוה לנמוך; ללא נתון — בסוף. */
export function sortLookupScopes(scopes: LookupScope[], sort: LookupSort): LookupScope[] {
  const alpha = (a: LookupScope, b: LookupScope) => a.city.localeCompare(b.city, "he") || numericOrder(a.ballot, b.ballot) || numericOrder(a.sub, b.sub);
  return [...scopes].sort((a, b) => {
    if (sort === "name") return alpha(a, b);
    const x = a[sort], y = b[sort];
    if (x === null || y === null) return x === y ? alpha(a, b) : x === null ? 1 : -1;
    return y - x || alpha(a, b);
  });
}
