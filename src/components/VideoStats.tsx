import type { VideoStats as Stats } from "../lib/crowdApi";

/** כרטיס סרטון הנתונים (הכרעת בעלים 26.10.2026) — למנהלי האתר והקבוצות. מצטבר בלבד, בלי מזהים */
/** withoutCount = בלי "סרטונים שנוצרו" — כשהמספר כבר מופיע בדשבורד הסטטיסטיקה (לא כותבים אותו מידע פעמיים) */
export default function VideoStats({ s, note, title = "סרטון הנתונים", withoutCount = false }: { s: Stats; note?: string; title?: string; withoutCount?: boolean }) {
  const tiles: [string, number][] = [["יצרו סרטון", s.makers], ["הוסיפו את הניחוש שלהם", s.withGuess], ["כתבו שם", s.named], ...(withoutCount ? [] : [["סרטונים שנוצרו", s.videos] as [string, number]])];
  return (
    <div>
      <p className="text-sm font-bold mb-2">{title}</p>
      <div className={`grid grid-cols-2 gap-3 ${withoutCount ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        {tiles.map(([label, n]) => (
          <div key={label} className="bg-paper-card border border-paper-line rounded-theme p-3">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="font-num tabular text-3xl leading-none mt-1">{n.toLocaleString("he-IL")}</p>
          </div>
        ))}
      </div>
      {note && <p className="text-xs text-ink-soft mt-2">{note}</p>}
    </div>
  );
}
