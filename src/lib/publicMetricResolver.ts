import { identity, METHOD_VERSION, PUBLIC_METRICS } from "./dataCatalog";
/** מדדים נוספים של הקטלוג: ערך שכבר חושב בקובץ, בלי נתון שהעוזר המציא. */
export { PUBLIC_METRICS } from "./dataCatalog";
export type PublicMetricId = keyof typeof PUBLIC_METRICS;
interface PublicInput {
  about?: { snapshotId?: string; updatedAt?: string; cacheStatus?: string };
  elections?: { id: string; date: string; valid: number; lists: { letters: string; votes: number; seats: number }[] }[];
  scenarios?: { lists: Record<string, { pass: number; seatsMean: number; seats: number[] }> };
  seats?: { full: { list: string; mean: number; min: number; max: number }[] };
  publishedAt?: string;
  open?: boolean;
  asOf?: string;
}
export function resolvePublicMetric(metricId: PublicMetricId, data: PublicInput, ids: string[], election?: string, screen = "method") {
  const definition = PUBLIC_METRICS[metricId];
  const members = [...new Set(ids)].sort();
  let value: number | null = null;
  let range: [number, number] | null = null;
  let sourceDate = data.asOf ?? data.about?.updatedAt ?? "";
  if (metricId.startsWith("official.results.")) {
    const result = data.elections?.find(r => r.id === election);
    if (result && members.length && members.every(id => result.lists.some(l => l.letters === id))) {
      value = result.lists.filter(l => members.includes(l.letters)).reduce((a, l) => a + (metricId.endsWith(".support") ? l.votes / result.valid * 100 : l.seats), 0);
      sourceDate = result.date;
    }
  } else if (metricId.startsWith("scenario.model.")) {
    const lists = data.scenarios?.lists;
    if (lists && members.length && members.every(id => lists[id])) {
      if (metricId.endsWith(".pass") && members.length === 1) value = lists[members[0]].pass * 100;
      else if (metricId.endsWith(".seatsMean")) {
        value = members.reduce((a, id) => a + lists[id].seatsMean, 0);
        if (members.length === 1) range = [lists[members[0]].seats[0], lists[members[0]].seats[2]];
        // טווח גוש אינו חיבור טווחי רשימות. בקשה כזו דורשת תרחישים משותפים.
      }
    }
  } else if (data.open && members.length === 1) {
    const row = data.seats?.full.find(r => r.list === members[0]);
    if (row) { value = row.mean; range = [row.min, row.max]; }
    sourceDate = data.publishedAt ?? sourceDate;
  }
  const snapshotId = metricId.startsWith("crowd.") ? data.about?.snapshotId ?? `crowd-${identity(Object.fromEntries(Object.entries(data).filter(([k]) => k !== "about")))}` : data.about?.snapshotId ?? "";
  const allowed = (definition.screens as readonly string[]).includes(screen);
  if (!allowed) value = null;
  const evidenceId = identity({ metricId, members, election, screen, snapshotId, method: METHOD_VERSION });
  return { metricId, subject: { ids: members }, value, unit: definition.unit, kind: definition.kind, label: definition.name, method: definition.method, range, snapshotId, methodVersion: METHOD_VERSION, status: !allowed ? "unsupported" : value === null ? "missing" : "available", computedAt: data.about?.updatedAt ?? sourceDate, latestFieldworkEnd: sourceDate, inputRefs: [definition.path], assumptions: [metricId.startsWith("crowd.") ? "השערות המשתתפים אינן סקר; גרסתן נפרדת מנתוני הסקרים" : "הערכים מאותו קובץ פרסום; אין חיבור טווחי תרחישים של רשימות"], cacheStatus: data.about?.cacheStatus ?? "current", evidenceId, evidence: { metricId, screen, ids: members, ...(election ? { election } : {}), snapshotId, evidenceId } };
}
