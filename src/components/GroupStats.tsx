import { useEffect, useState } from "react";
import { call, type GroupStats as Stats } from "../lib/crowdApi";

/** מספרים למנהל קבוצה (docs/פילוח-קבוצות-תכנון.md): רק מצטבר, ורק מ-50 רשומים מהקבוצה. refresh = מונה שמשתנה אחרי העלאה */
export default function GroupStats({ group, token, refresh }: { group: string; token: string; refresh: number }) {
  const [s, setS] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    call<Stats>(`/group/stats?group=${encodeURIComponent(group)}`, { token })
      .then((x) => { if (live) { setS(x); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [group, token, refresh]);
  if (failed) return <p className="text-sm text-ink-soft">המספרים אינם זמינים כרגע.</p>;
  if (!s) return <p className="text-sm text-ink-soft">טוען…</p>;
  if (s.belowMin) return <p className="text-sm text-ink-soft">פחות מ-{s.min} חברים מהקבוצה רשומים באתר. המספרים יוצגו מ-{s.min} רשומים.</p>;
  const tiles: [string, number][] = [["נרשמו בסך הכול", s.registered], ["נרשמו היום", s.today], ["שמרו השערת מנדטים", s.seats], ["שמרו הצבעה", s.vote]];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiles.map(([label, n]) => (
        <div key={label} className="bg-paper-card border border-paper-line rounded-theme p-3">
          <p className="text-xs text-ink-soft">{label}</p>
          <p className="font-num tabular text-3xl leading-none mt-1">{n}</p>
        </div>
      ))}
    </div>
  );
}
