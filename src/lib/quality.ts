import qualityFile from "../data/quality.json";
import { FIELD_GROUP_LABEL, type FieldGroup } from "./data";

/**
 * בקרת הנתונים (ביקורת קודקס 12.10.2026): כיסוי (כל הסקרים מול החישובים), סתירות פתוחות ויומן התיקונים.
 * הקובץ נבנה בצינור (`build_quality`) מאותם סקרים שבאתר — אין כאן חישוב.
 */
export interface QualityWho { id: string; firmHe: string; publisherHe: string | null; end: string }
export interface QualityConflict extends QualityWho { group: FieldGroup; detail: string; source: string | null }
export interface QualityCorrection extends QualityWho {
  field: string;
  group: FieldGroup | "pollster" | "other";
  from: unknown;
  to: unknown;
  source: string | null;
  reason: string;
  affects: string[];
}
export interface Quality {
  asOf: string;
  coverage: {
    total: number;
    usable: number;
    firstEnd: string;
    listSubmission: string;
    sinceListSubmission: number;
    model: { start: string; used: number; skipped: number } | null;
    forecastWindowDays: number;
  };
  conflicts: QualityConflict[];
  corrections: QualityCorrection[];
}
export const quality = qualityFile as unknown as Quality;

export const groupLabel = (g: QualityCorrection["group"]) => (g === "pollster" ? "עורך הסקר" : g === "other" ? "שדה אחר" : FIELD_GROUP_LABEL[g]);
