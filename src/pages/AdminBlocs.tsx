import { useEffect, useState } from "react";
import { listName } from "../lib/data";
import { Notice } from "./guess/ui";

/**
 * כל הגושים שהמשתתפים הגדירו (הכרעת בעלים 12.10.2026): לכל הרכב — כמה משתתפים, והשמות שנתנו לו. בלי מזהים.
 * נטען רק כשפותחים את המגירה (במסך הניהול התוכן נטען בפתיחתה).
 */
type Bloc = { lists: string[]; participants: number; approvedName: string | null; names: { name: string; n: number }[] };

export default function AdminBlocs({ api }: { api: (path: string) => Promise<unknown> }) {
  const [blocs, setBlocs] = useState<Bloc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try { setBlocs(((await api("/admin/blocs")) as { blocs: Bloc[] }).blocs); } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div className="space-y-3">
        <p className="text-xs text-ink-soft">לפי הגושים האחרונים של כל משתתף (בלי משתתפים "בבדיקה"). כל הרכב מפלגות מופיע פעם אחת, עם כל השמות שנתנו לו.</p>
        {error && <Notice tone="warn">{error}</Notice>}
        {!blocs && !error && <p className="text-ink-soft">טוען…</p>}
        {blocs && !blocs.length && <p className="text-sm text-ink-soft">עדיין אף משתתף לא הגדיר גושים.</p>}
        {blocs && blocs.length > 0 && (
          <ul className="divide-y divide-paper-line border-y border-paper-line">
            {blocs.map((b) => (
              <li key={b.lists.join(",")} className="py-3 space-y-1 text-sm">
                <p className="flex justify-between gap-3 items-baseline">
                  <span className="font-bold">{b.lists.map(listName).join(" · ")}</span>
                  <span className="tabular whitespace-nowrap">{b.participants} {b.participants === 1 ? "משתתף" : "משתתפים"}</span>
                </p>
                {b.approvedName && <p className="text-xs text-ink-soft">שם מאושר בסטטיסטיקות: {b.approvedName}</p>}
                <p className="text-ink-soft">{b.names.map((x) => `${x.name}${x.n > 1 ? ` (${x.n})` : ""}`).join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
