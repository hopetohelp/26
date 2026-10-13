import { dataProvider, metricResult } from "./data.js";
import { hasNumber } from "./answer.js";
const fail = message => { throw Object.assign(new Error(message), { code: "invalid_evidence", userMessage: message }); };
/** אין ערך מספרי חופשי בכרטיס: השרת שולף שוב את הראיה באותה גרסה. */
export async function materializeAnswer(ctx, input) {
  const output = structuredClone(input);
  let existing;
  let pollSnapshot;
  let crowdSnapshot;
  const resolve = async evidence => {
    if (!evidence || typeof evidence !== "object" || !evidence.snapshotId || !evidence.evidenceId) fail("מספר מחייב הפניית ראיה משליפת הנתונים");
    if (!evidence.metricId) existing ??= await dataProvider(ctx);
    const r = await metricResult(ctx, evidence, existing);
    if (r.snapshotId.startsWith("crowd-")) {
      if (crowdSnapshot && crowdSnapshot !== r.snapshotId) fail("אין לחבר גרסאות משתתפים שונות באותו כרטיס");
      crowdSnapshot = r.snapshotId;
    } else {
      if (pollSnapshot && pollSnapshot !== r.snapshotId) fail("אין לחבר גרסאות נתונים שונות באותו כרטיס");
      pollSnapshot = r.snapshotId;
    }
    if (r.status !== "available" || r.value === null) fail("אין נתון זמין בראיה שנבחרה");
    return r;
  };
  const refs = async evidence => {
    if (!Array.isArray(evidence) || !evidence.length || evidence.length > 20) fail("טענה מספרית בטקסט מחייבת הפניות ראיה");
    await Promise.all(evidence.map(resolve));
  };
  if ([output.title, output.summary, output.footnote].some(s => typeof s === "string" && hasNumber(s))) await refs(output.evidence);
  delete output.evidence;
  for (const section of output.sections ?? []) {
    if (section.kind === "numbers") {
      for (let i = 0; i < (section.items ?? []).length; i++) {
        const item = section.items[i];
        if (item.value !== undefined || item.kind !== undefined || item.asOf !== undefined || item.method !== undefined) fail("ערך המספר והמקור נקבעים בשרת מתוך הראיה בלבד");
        const r = await resolve(item.evidence);
        if (item.detail && hasNumber(item.detail)) fail("טווח מספרי נקבע מהראיה, לא מטקסט חופשי");
        const value = `${Math.round(r.value * 10) / 10}${r.unit === "אחוזים" ? "%" : " מנדטים"}`;
        section.items[i] = { label: item.label, value, ...(r.range ? { detail: `${r.kind === "תרחיש" ? "טווח 80% מהתרחישים" : r.kind?.startsWith("השערות") ? "טווח השערות" : "טווח סקרים"} ${r.range[0]}–${r.range[1]}` } : item.detail ? { detail: item.detail } : {}), kind: r.kind ?? (r.selection?.product === "polls.adjusted" ? "חישוב לפי החוק" : "סיכום סקרים"), asOf: r.latestFieldworkEnd ?? r.computedAt.slice(0, 10), method: r.method };
      }
    } else if (section.kind === "table") {
      let first;
      for (const row of section.rows ?? []) for (let i = 0; i < row.length; i++) {
        if (row[i] && typeof row[i] === "object") { const r = await resolve(row[i].evidence); first ??= r; row[i] = String(Math.round(r.value * 10) / 10); }
        else if (typeof row[i] === "string" && hasNumber(row[i])) fail("תא מספרי בטבלה מחייב הפניית ראיה");
      }
      if (first) section.source = { kind: first.kind ?? "סיכום סקרים", asOf: first.latestFieldworkEnd ?? first.computedAt.slice(0, 10), method: first.method };
    } else if (section.kind === "text" && hasNumber(section.text ?? "") || section.kind === "list" && (section.items ?? []).some(s => typeof s === "string" && hasNumber(s))) await refs(section.evidence);
    delete section.evidence;
  }
  return output;
}
export const EVIDENCE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    metricId: { type: "string" }, election: { type: "string" },
    selection: { type: "object", additionalProperties: false, properties: { product: { type: "string", enum: ["polls.mean", "polls.adjusted", "model.mean", "poll.single"] }, source: { type: "string" }, asOf: { type: "string" }, days: { type: "integer" } }, required: ["product"] },
    ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 30 },
    measure: { type: "string", enum: ["seats", "support"] }, operation: { type: "string", enum: ["difference", "majorityGap"] }, compareTo: { type: "object", properties: { selection: { type: "object" }, ids: { type: "array", items: { type: "string" } } }, required: ["selection", "ids"] },
    screen: { type: "string" }, snapshotId: { type: "string" }, evidenceId: { type: "string" },
  }, required: ["ids", "snapshotId", "evidenceId"], anyOf: [{ required: ["selection"] }, { required: ["metricId"] }],
};
