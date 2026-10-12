import { useState } from "react";
import { groupImageUrl } from "../lib/groupLink";

/**
 * ראש סקר האתר כשהוא פתוח על קבוצה (הכרעת בעלים 12.10.2026): תמונת הקבוצה, ואם אין לגולש מתג עם שם הקבוצה — גם שמה.
 * showName=false כשהשם כבר מוצג במתג "כל המשתתפים / הקבוצה" (לא כותבים אותו מידע פעמיים באותו מסך).
 */
export default function GroupBanner({ id, name, image, showName }: { id: string; name: string | null; image: string | null | undefined; showName: boolean }) {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : groupImageUrl({ id }, image);
  if (!src && !showName) return null;
  return (
    <div className="mb-4 bg-paper-card border border-paper-line rounded-theme p-3 text-center space-y-2">
      {src && <img src={src} alt={showName ? "" : name ?? ""} onError={() => setBroken(true)} className="mx-auto max-h-44 w-auto max-w-full object-contain rounded-theme" />}
      {showName && name && <h2 className="text-2xl font-display leading-tight">{name}</h2>}
    </div>
  );
}
