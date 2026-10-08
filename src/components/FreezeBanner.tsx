import { meta } from "../lib/data";

/**
 * חוק הבחירות (דרכי תעמולה), סעיף 16ה(ח): מתום יום שישי שלפני הבחירות ועד סגירת הקלפיות
 * אין לפרסם סקר שלא פורסם קודם, ומי שמפרסם סקר ישן מציין בהבלטה שאינו עדכני.
 * האכיפה העיקרית בבנייה (`meta.frozen` + אין קליטת סקרים אחרי הסף); שעון הדפדפן — גיבוי בלבד.
 */
export function isFrozen(now = Date.now()): boolean {
  if (meta.frozen) return true;
  return now >= Date.parse(meta.freezeStart) && now < Date.parse(meta.freezeEnd);
}

export default function FreezeBanner() {
  if (!isFrozen()) return null;
  return (
    <div role="alert" className="bg-warn-soft border-y border-warn text-warn">
      <p className="w-full mx-auto px-4 md:px-6 py-3 font-bold">
        הסקרים באתר אינם עדכניים ואין ללמוד מהם על דפוסי הצבעה או עמדות הציבור היום. לפי חוק, מתום יום שישי שלפני
        הבחירות ועד סגירת הקלפיות לא מתפרסמים סקרים חדשים; כל הסקרים כאן פורסמו לראשונה לפני כן.
      </p>
    </div>
  );
}
