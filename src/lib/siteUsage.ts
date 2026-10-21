import { FEEDBACK_URL } from "./feedback";

export interface SiteUsage {
  totalVisitors: number;
  totalVisits: number;
  publishedAt: string;
}

export function isSiteUsage(v: unknown): v is SiteUsage {
  if (!v || typeof v !== "object") return false;
  const x = v as SiteUsage;
  return Number.isSafeInteger(x.totalVisitors) && x.totalVisitors >= 0 &&
    Number.isSafeInteger(x.totalVisits) && x.totalVisits >= 0 &&
    typeof x.publishedAt === "string" && Number.isFinite(Date.parse(x.publishedAt));
}

/** אותו מקור כמו הניהול; העותק הציבורי הוא גיבוי בלבד, לא ספירה נוספת. */
export async function loadSiteUsage(signal: AbortSignal): Promise<{ data: SiteUsage; live: boolean }> {
  const read = async (url: string) => {
    const r = await fetch(url, { signal, credentials: "omit" });
    if (!r.ok) throw new Error("usage unavailable");
    const data: unknown = await r.json();
    if (!isSiteUsage(data)) throw new Error("invalid usage");
    return data;
  };
  if (FEEDBACK_URL) {
    try { return { data: await read(`${FEEDBACK_URL}/usage`), live: true }; }
    catch (e) { if (signal.aborted) throw e; }
  }
  return { data: await read(`${import.meta.env.BASE_URL}data/usage.json`), live: false };
}
