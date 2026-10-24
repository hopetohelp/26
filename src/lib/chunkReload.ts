/**
 * מסך שנטען בנפרד אחרי פרסום גרסה חדשה (הכרעת בעלים 25.10.2026): הקובץ הישן כבר לא קיים, והדף מתרענן לבד לגרסה החדשה.
 * עד הרענון מוצג "טוען…" ולא מסך קריסה, והרענון זמין שוב בכל פרסום — לא רק פעם אחת בלשונית. כשהטעינה נכשלת שוב
 * תוך RELOAD_GAP_MS אחרי רענון, אין רענון נוסף (בלי לולאה) והשגיאה מוצגת כרגיל.
 */
export const RELOAD_KEY = "elections26.chunk-reload";
export const RELOAD_GAP_MS = 30_000;

/** האם לרענן עכשיו; שומר את זמן הרענון */
export function shouldReload(now = Date.now(), store: Pick<Storage, "getItem" | "setItem"> = sessionStorage): boolean {
  try {
    const last = Number(store.getItem(RELOAD_KEY)) || 0;
    if (now - last < RELOAD_GAP_MS) return false;
    store.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** טעינת מסך ל-lazy: כשהטעינה בוטלה לטובת רענון (התוצאה ריקה) — ממתינים לרענון במקום לקרוס */
export function page<T>(load: () => Promise<T>): () => Promise<T> {
  return () => load().then((m) => m ?? new Promise<T>(() => {}));
}
