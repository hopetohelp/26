import { CROWD_URL, type GroupRef } from "./crowdApi";
import { SITE_URL } from "./shareGuess";

/**
 * קישור קבוצה (docs/פילוח-קבוצות-תכנון.md, סעיף 10): שם באנגלית בכתובת, תמונה בראש סקר האתר, והעתקת הקישור.
 * הכללים כמו בשרת (worker/crowd/index.js, SLUG): a-z, ספרות ומקף באמצע, 3–32 תווים.
 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/** נוקה תוך כדי הקלדה: אותיות קטנות, רווח הופך למקף, כל השאר נמחק. מקף בקצה מותר עד השמירה */
export const cleanSlugInput = (text: string) => text.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").slice(0, 32);

/** הצורה הסופית לשמירה: בלי מקף בקצוות. null אם אינה תקינה */
export function finalSlug(text: string): string | null {
  const s = cleanSlugInput(text).replace(/^-+|-+$/g, "");
  return SLUG_RE.test(s) ? s : null;
}

/** הכתובת שמוסרים לחברים: https://hopetohelp.github.io/26/#/g/<slug> */
export const groupUrl = (slug: string) => `${SITE_URL}#/g/${slug}`;

/** כתובת התמונה לתגית img. ver = זמן העדכון (GroupRef.image), כדי שהחלפה תוצג מיד */
export function groupImageUrl(by: { slug: string } | { id: string }, ver: string | null | undefined): string | null {
  if (!CROWD_URL || !ver) return null;
  const who = "slug" in by ? `slug=${encodeURIComponent(by.slug)}` : `group=${encodeURIComponent(by.id)}`;
  return `${CROWD_URL}/group/image?${who}&v=${encodeURIComponent(ver)}`;
}
export const refImageUrl = (g: GroupRef) => groupImageUrl({ id: g.id }, g.image);

/** מידות אחרי הקטנה: הצלע הארוכה עד max, בלי הגדלה */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** תמונה ל-data URL של JPEG עד maxBytes (כמו IMAGE_MAX בשרת): מוקטנת ל-800 נקודות, ואם צריך באיכות נמוכה יותר. רקע לבן לשקיפות */
export async function imageToDataUrl(file: File, maxBytes = 140 * 1024): Promise<string> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitSize(bmp.width, bmp.height, 800);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  for (const q of [0.85, 0.75, 0.65, 0.5, 0.35]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (Math.floor((url.length - url.indexOf(",") - 1) * 0.75) <= maxBytes) return url;
  }
  throw new Error("too_large");
}
