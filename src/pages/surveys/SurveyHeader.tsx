import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import BackButton from "../../components/BackButton";
import { participantsLabel } from "../../lib/surveys";

/** ראש אחיד לכל מסך סקר וניחוש (הכרעת בעלים 03.11.2026): חזרה, כותרת, ושורת המשתתפים */
export default function SurveyHeader({ title, participants, aside, backToAdmin, embed, children }: { title: string; backToAdmin?: boolean; embed?: boolean; participants?: { all: number; group: number; outside: boolean } | null; aside?: ReactNode; children?: ReactNode }) {
  return <>
    {/* נכנסו מטבלת הניהול ⇐ "חזרה לניהול" במקום "חזרה" (הכרעת בעלים 03.11.2026) */}
    {/* בעמוד מוטמע: בלי "חזרה" — כפתור אחד בפינה הימנית העליונה (הכרעת בעלים 03.11.2026) */}
    <div className="pt-2">{embed ? <Link to="/surveys?embed=1" className="f-btn !min-h-[36px]">לכל הסקרים והניחושים</Link> : backToAdmin ? <Link to="/group-admin" className="f-btn !min-h-[36px]">→ חזרה לניהול</Link> : <BackButton />}</div>
    <div className="flex items-start justify-between gap-2 pt-1">
      <h1 className="text-[26px] font-display leading-tight">{title}</h1>
      {aside}
    </div>
    <div className="flex flex-wrap items-center gap-2 -mt-1.5 text-sm text-ink-soft">
      {participants && <span className="font-num tabular">{participantsLabel(participants)}</span>}
      {children}
    </div>
  </>;
}
