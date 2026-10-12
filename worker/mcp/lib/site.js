/**
 * הנתונים הציבוריים — רק מקובצי הנתונים הפתוחים של האתר (שלב 1: data/index.json, data/*.json), בלי עותק כאן.
 * כך שרת ה-MCP, המפתח וסשן Claude Code קוראים אותו מקור, והוא מתעדכן בכל פרסום (כל 4 שעות).
 * מטמון בזיכרון ל-5 דקות לכל קובץ, כדי לא לפנות לאתר בכל קריאה.
 */
const TTL = 5 * 60 * 1000;
const cache = new Map();

export class SiteUnavailable extends Error {}

export async function siteJson(env, path, now = Date.now()) {
  const hit = cache.get(path);
  if (hit && hit.at > now - TTL) return hit.data;
  let res;
  try { res = await fetch(env.SITE_URL + path, { cf: { cacheTtl: 60 } }); } catch { res = null; }
  if (!res || !res.ok) {
    if (hit) return hit.data; // האתר לא ענה — העותק האחרון שבזיכרון
    throw new SiteUnavailable(path);
  }
  const data = await res.json();
  cache.set(path, { at: now, data });
  return data;
}

export const resetSiteCache = () => cache.clear();

/** הקישור "איך זה חושב?" לעוגן, מתוך האינדקס (anchors). null ⇐ העוגן אינו קיים */
export async function methodUrlFor(env, now) {
  const idx = await siteJson(env, "data/index.json", now);
  // anchors — כל העוגנים (גם בתוך ערכים); בלעדיו (אינדקס ישן) — ערכי המילון עצמם
  const map = new Map([...(idx.dictionary ?? []), ...(idx.anchors ?? [])].map((a) => [a.id, a.url]));
  return (anchor) => (typeof anchor === "string" ? map.get(anchor) ?? null : null);
}
