import type { VideoStats as Stats } from "../lib/crowdApi";

/** כרטיס סרטון הנתונים (הכרעת בעלים 26.10.2026) — למנהלי האתר והקבוצות. מצטבר בלבד, בלי מזהים */
export default function VideoStats({ s, note, title = "סרטון הנתונים" }: { s: Stats; note?: string; title?: string }) {
  const tiles: [string, number][] = [["יצרו סרטון", s.makers], ["הוסיפו את הניחוש שלהם", s.withGuess], ["כתבו שם", s.named], ["סרטונים שנוצרו", s.videos]];
  return (
    <div>
      <p className="text-sm font-bold mb-2">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
