import { PUBLIC_METRICS, resolvePublicMetric } from "../../../src/lib/publicMetricResolver.ts";
import { SCREEN_POLICY } from "../../../src/lib/dataCatalog.ts";
/** ספק זהה לאתר, מוזן בקלט הפרסום ולא בעותק המודל שבחבילת השרת. */
import { createDataProvider } from "../../../src/lib/dataResolverCore.ts";
import { DATA_PRODUCTS } from "../../../src/lib/dataCatalog.ts";
import { cleanDataPreference } from "../../../src/lib/dataPreferences.ts";
export async function dataProvider(ctx) {
  const file = await ctx.site("data/average.json");
  if (!file.providerInput || !file.about?.snapshotId) throw Object.assign(new Error("פרסום הנתונים עדיין אינו תומך בחוזה החדש"), { code: "unavailable", userMessage: "פרסום הנתונים עדיין אינו תומך בחוזה החדש" });
  const provider = createDataProvider(file.providerInput);
  const index = await ctx.site("data/index.json");
  if (index.snapshotId !== file.about.snapshotId) throw Object.assign(new Error("גרסאות הפרסום אינן תואמות"), { code: "snapshot_mismatch", userMessage: "גרסאות הפרסום אינן תואמות; נסו שוב לאחר הרענון" });
  if (provider.SNAPSHOT_ID !== file.about.snapshotId) throw Object.assign(new Error("גרסאות הנתונים אינן תואמות"), { code: "snapshot_mismatch", userMessage: "גרסאות הנתונים אינן תואמות; נסו לאחר הרענון" });
  return { provider, about: file.about };
}
export async function metricResult(ctx, request = {}, existing = null) {
  if (request.metricId) {
    const definition = Object.prototype.hasOwnProperty.call(PUBLIC_METRICS, request.metricId) ? PUBLIC_METRICS[request.metricId] : null;
    if (!definition) throw Object.assign(new Error("מדד לא מוכר"), { code: "invalid_input", userMessage: "מדד לא מוכר" });
    const data = await ctx.site(definition.path);
    if (!request.metricId.startsWith("crowd.")) {
      const index = await ctx.site("data/index.json");
      if (index.snapshotId !== data.about?.snapshotId) throw Object.assign(new Error("גרסאות הפרסום אינן תואמות"), { code: "snapshot_mismatch", userMessage: "גרסאות הפרסום אינן תואמות" });
    }
    const result = resolvePublicMetric(request.metricId, data, request.ids ?? [], request.election, request.screen ?? "method");
    if (request.snapshotId && request.snapshotId !== result.snapshotId || request.evidenceId && request.evidenceId !== result.evidenceId) throw Object.assign(new Error("הראיה אינה מתאימה לגרסת הנתון"), { code: "invalid_evidence", userMessage: "הראיה אינה מתאימה לגרסת הנתון; שלפו מחדש" });
    return result;
  }
  const { provider, about } = existing ?? await dataProvider(ctx);
  let selection = request.selection;
  if (!selection && ctx.mode === "user") selection = cleanDataPreference((await ctx.me()).prefs?.dataSource)?.selection;
  selection ??= { product: "polls.mean" };
  if (!Object.prototype.hasOwnProperty.call(DATA_PRODUCTS, selection.product)) throw Object.assign(new Error("מקור לא מוכר"), { code: "invalid_input", userMessage: "מקור לא מוכר" });
  if (request.screen && !Object.prototype.hasOwnProperty.call(SCREEN_POLICY, request.screen) || request.measure && !["seats", "support"].includes(request.measure) || request.operation && !["difference", "majorityGap"].includes(request.operation)) throw Object.assign(new Error("בקשת מדד לא תקינה"), { code: "invalid_input", userMessage: "בקשת מדד לא תקינה" });
  if (selection.firms && (!Array.isArray(selection.firms) || !selection.firms.length || selection.firms.length > 50 || selection.firms.some(f => typeof f !== "string" || !provider.SOURCE_OPTIONS.some(o => o.firmId === f)))) throw Object.assign(new Error("בחרו מכונים קיימים"), { code: "invalid_input", userMessage: "בחרו מכונים קיימים" });
  const ids = [...new Set(request.ids ?? [])];
  if (!ids.length || ids.some(id => !providerIds(provider).includes(id))) throw Object.assign(new Error("בחרו מזהי רשימות קיימים"), { code: "invalid_input", userMessage: "בחרו מזהי רשימות קיימים" });
  const result = provider.resolveMetric({ selection, ids, screen: request.screen ?? "method", measure: request.measure, operation: request.operation, compareTo: request.compareTo });
  if (request.snapshotId && request.snapshotId !== result.snapshotId) throw Object.assign(new Error("גרסת הראיה התיישנה"), { code: "snapshot_mismatch", userMessage: "גרסת הראיה התיישנה; שלפו את הנתון מחדש" });
  if (request.evidenceId && request.evidenceId !== result.evidenceId) throw Object.assign(new Error("הפניית הראיה אינה מתאימה לבקשה"), { code: "invalid_evidence", userMessage: "הפניית הראיה אינה מתאימה לבקשה" });
  return { ...result, cacheStatus: about.cacheStatus ?? "current", evidence: { selection: result.selection, ids: result.subject.ids, screen: request.screen ?? "method", ...(request.measure ? { measure: request.measure } : {}), ...(request.operation ? { operation: request.operation } : {}), ...(request.compareTo ? { compareTo: request.compareTo } : {}), snapshotId: result.snapshotId, evidenceId: result.evidenceId } };
}
const providerIds = p => p.resolveDataset({ product: "polls.mean" }).rows.map(r => r.subject.ids[0]);
