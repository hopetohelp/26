import { DATA_PRODUCTS, type AverageId } from "./dataCatalog";
import type { Selection } from "./dataResolver";
export interface DataPreference { version: 1; selection: Selection; preferredAverage: AverageId; updatedAt: string }
export function cleanDataPreference(value: unknown): DataPreference | null {
  if (!value || typeof value !== "object") return null;
  const p = value as DataPreference;
  if (p.version !== 1 || !p.selection || !Object.prototype.hasOwnProperty.call(DATA_PRODUCTS, p.selection.product) || !["polls.mean", "polls.adjusted", "model.mean"].includes(p.preferredAverage)) return null;
  if (typeof p.updatedAt !== "string" || !Number.isFinite(Date.parse(p.updatedAt))) return null;
  const source = p.selection.source;
  if (p.selection.product === "poll.single" && (typeof source !== "string" || source.length > 200 || !/^(firm|series):[^\n\r]+$/.test(source))) return null;
  return { version: 1, selection: { product: p.selection.product, ...(p.selection.product === "poll.single" ? { source } : {}) }, preferredAverage: p.preferredAverage, updatedAt: new Date(p.updatedAt).toISOString() };
}
export function newerPreference(local: DataPreference | null, remote: DataPreference | null): DataPreference | null {
  if (!local) return remote;
  if (!remote) return local;
  return Date.parse(local.updatedAt) > Date.parse(remote.updatedAt) ? local : remote;
}
