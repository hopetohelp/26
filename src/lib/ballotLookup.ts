import { flow, newName, oldName, SAME } from "./voterFlow";

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

export function matchingPlaces(units: BallotUnits, city: string): [string, BallotPlace][] {
  const all = Object.entries(units.places), query = normalize(city);
  const exact = all.filter(([, p]) => normalize(p.name) === query);
  return exact.length ? exact : all.filter(([, p]) => normalize(p.name).includes(query));
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

/** שדה ריק משאיר את רמת הסינון שמעליו. מספר שלם כולל את כל תתי הקלפי. */
export function filterBallots(units: BallotUnits, filter: BallotFilter) {
  const places = matchingPlaces(units, filter.city), number = filter.ballot.trim(), sub = filter.sub.trim();
  const exact = places.some(([, p]) => [...p.y26, ...p.y22].some((r) => baseNumber(r[0]) === number));
  const match = (r: Ballot) => (!number || (exact ? baseNumber(r[0]) === number : baseNumber(r[0]).startsWith(number)))
    && (!sub || subNumber(r[0]) === sub);
  return { y22: places.flatMap(([, p]) => p.y22.filter(match)), y26: places.flatMap(([, p]) => p.y26.filter(match)) };
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
