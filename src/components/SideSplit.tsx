import type { ReactNode } from "react";

/**
 * פיצול לפי רוחב התוכן (הכרעת בעלים 12.10.2026, נבנה לאזור האישי, רכיב אחיד שאפשר להעתיק למסכים אחרים):
 * מתחת ל-1024 פיקסלים — טור אחד: `side` למעלה ו-`main` מתחתיו.
 * מ-1024 ומעלה — `side` בטור הימני, ברוחב שהתוכן שלו צריך, אבל לא פחות מרבע ולא יותר מחצי; `main` מקבל את השאר.
 * כל טור נגלל לבד, וההורה קובע את הגובה (בטור אחד — גובה חופשי).
 */
export function SideSplit({ side, main, className = "" }: { side: ReactNode; main: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col lg:flex-row lg:min-h-0 ${className}`}>
      <div className="min-w-0 lg:flex-none lg:w-max lg:min-w-[25%] lg:max-w-[50%] lg:overflow-y-auto lg:pe-6 lg:border-e lg:border-paper-line">{side}</div>
      <div className="flex-1 min-w-0 flex flex-col lg:min-h-0 lg:ps-6">{main}</div>
    </div>
  );
}
