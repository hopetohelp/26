import type { ReactNode } from "react";
import BackButton from "../../components/BackButton";
import { participantsLabel } from "../../lib/surveys";

/** ראש אחיד לכל מסך סקר וניחוש (הכרעת בעלים 03.11.2026): חזרה, כותרת, ושורת המשתתפים */
export default function SurveyHeader({ title, participants, aside, children }: { title: string; participants?: { all: number; group: number; outside: boolean } | null; aside?: ReactNode; children?: ReactNode }) {
  return <>
    <div className="pt-2"><BackButton /></div>
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
