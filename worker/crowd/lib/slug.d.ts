/** טיפוסים ל-slug.js — כדי שהאתר ישתמש באותו תעתיק לאנגלית כמו השרת (מקור אחד; כלל ברזל 9) */
export function slugFromName(name: string | null | undefined): string | null;
export function freeSlug(base: string, taken: (slug: string) => Promise<boolean>): Promise<string>;
