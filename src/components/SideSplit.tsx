import type { ReactNode } from "react";

/**
 * מגירות ותוכן (הכרעת בעלים 12.10.2026, המבנה של "תפריט ותוכן" מקרובים מתמיד; רכיב אחיד שאפשר להעתיק למסכים אחרים).
 * מתחת ל-768 פיקסלים — טור אחד: `side` למעלה ו-`main` מתחתיו.
 * מ-768 ומעלה — שני טורים ברוחב קבוע: `side` מימין, הגדול מבין שליש ו-24rem; `main` משמאל.
 * 🔴 הרוחב לא תלוי בתוכן ואין חזרה לטור אחד: פתיחת מגירה לא מזיזה דבר. כל טור בגובה המסך ונגלל לבד.
 * בטור `side` — רק הכותרת והמגירות, וכל התוכן בתוך המגירות.
 */
export function SideSplit({ side, main, className = "" }: { side: ReactNode; main: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col md:grid md:grid-cols-[max(24rem,calc(100%/3))_minmax(0,1fr)] md:min-h-0 ${className}`}>
      <div className="min-w-0 md:overflow-y-auto md:pe-6 md:border-e md:border-paper-line">{side}</div>
      <div className="min-w-0 flex flex-col md:min-h-0 md:ps-6">{main}</div>
    </div>
  );
}
