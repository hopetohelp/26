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

/** יש פיקסל שקוף (או חצי שקוף) ברצף RGBA של canvas */
export function hasAlpha(rgba: Uint8ClampedArray | number[]): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) return true;
  return false;
}
/** גודל הקובץ בבתים מתוך data URL ב-base64 */
export const dataUrlBytes = (url: string) => Math.floor((url.length - url.indexOf(",") - 1) * 0.75);

/**
 * תמונה ל-data URL עד maxBytes (כמו IMAGE_MAX בשרת): מוקטנת ל-800 נקודות, ואם צריך עוד — קטנה יותר.
 * לוגו שקוף נשאר שקוף (WebP, ואם הדפדפן לא מקודד WebP — PNG), כדי שיוצג על רקע האתר; תמונה בלי שקיפות — JPEG קטן.
 */
export async function imageToDataUrl(file: File, maxBytes = 140 * 1024): Promise<string> {
  const bmp = await createImageBitmap(file);
  try {
    let size = fitSize(bmp.width, bmp.height, 800);
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = size.w; canvas.height = size.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bmp, 0, 0, size.w, size.h);
      const alpha = hasAlpha(ctx.getImageData(0, 0, size.w, size.h).data);
      const tries: [string, number[]][] = alpha ? [["image/webp", [0.9, 0.75, 0.55]], ["image/png", [1]]] : [["image/jpeg", [0.85, 0.75, 0.65, 0.5, 0.35]]];
      for (const [type, qualities] of tries) for (const q of qualities) {
        const url = canvas.toDataURL(type, q);
        if (url.startsWith(`data:${type};`) && dataUrlBytes(url) <= maxBytes) return url;
      }
      size = fitSize(size.w, size.h, Math.round(Math.max(size.w, size.h) * 0.75));
    }
  } finally { bmp.close?.(); }
  throw new Error("too_large");
}
