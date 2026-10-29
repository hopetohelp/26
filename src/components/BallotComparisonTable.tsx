import { useMemo } from "react";
import InfoTip from "./InfoTip";
import { PartyAvatar } from "./PartyAvatar";
import { num, pctValue } from "../lib/format";
import { ballotPartyRows, ballotShare, ballotSummary, comparisonBallots, type BallotFilter, type BallotUnits } from "../lib/ballotLookup";

const signed = (n: number, percent = false) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${percent ? pctValue(Math.abs(n)) : num(Math.abs(n))}`;
function Value({ votes, share, gap = false }: { votes: number | null; share?: number | null; gap?: boolean }) {
  if (votes === null) return <span aria-label="אין נתון להשוואה">—</span>;
  return <span className="block tabular-nums text-xs sm:text-sm leading-snug">
    <bdi dir="ltr" className="block">{gap ? signed(votes) : num(votes)}</bdi>
    {share !== undefined && <span className="block text-xs text-ink-soft"><bdi dir="ltr">{share === null ? "—" : `${gap ? signed(share, true) : pctValue(share)}%`}</bdi></span>}
  </span>;
}
const difference = (a: number | null, b: number | null) => a === null || b === null ? null : b - a;

export default function BallotComparisonTable({ units, filter, label }: { units: BallotUnits; filter: BallotFilter; label?: string }) {
  const selected = useMemo(() => comparisonBallots(units, filter), [units, filter]);
  const rows = useMemo(() => ballotPartyRows(units, selected.y22, selected.y26), [units, selected]);
  const old = ballotSummary(selected.y22, units.letters22), now = ballotSummary(selected.y26, units.letters26);
  const summary = [
    { label: "בעלי זכות בחירה", a: old.eligible, b: now.eligible, ap: undefined, bp: undefined },
    { label: "מצביעים", a: old.voters, b: now.voters, ap: old.turnout, bp: now.turnout },
    { label: "קולות כשרים", a: old.valid, b: now.valid, ap: old.validShare, bp: now.validShare },
  ];
  return !old.present && !now.present ? <p role="status">לא נמצאו קלפיות מתאימות.</p> : (
      <table className="w-full table-fixed text-sm text-center">
        <caption className="sr-only">השוואת קולות לפי מפלגה ל־{label || "סינון הנבחר"}, 2022 מול 2026. הפער הוא 2026 פחות 2022; </caption>
        <colgroup><col className="w-[34%] sm:w-[40%]" /><col /><col /><col /></colgroup>
        <thead><tr className="border-b border-paper-line align-top">
          <th scope="col" className="text-start py-2">מפלגה</th>
          <th scope="col" className="py-2">2022{selected.estimated && <span className="block mt-1 text-xs font-normal text-ink-soft">אומדן מותאם</span>}</th>
          <th scope="col" className="py-2">2026</th>
          <th scope="col" className="py-2"><span className="flex flex-wrap items-baseline justify-center gap-x-2"><span>הפער</span><span className="text-xs">{selected.status.label}</span>{selected.status.reason.length > 35 && <InfoTip label="הסבר רמת ההשוואה">{selected.status.reason}</InfoTip>}</span>
            {selected.status.reason && selected.status.reason.length <= 35 && <span className="block mt-1 text-[10px] sm:text-xs font-normal text-ink-soft">({selected.status.reason})</span>}
          </th>
        </tr></thead>
        <tbody>
          <tr className="bg-accent-soft font-bold border-b-2 border-paper-line align-top">
            <th scope="row" className="text-start py-3 pe-1">נתוני הצבעה<div className="mt-2 grid gap-3 text-xs font-normal">{summary.map((s) => <span key={s.label} className={s.ap !== undefined ? "min-h-[2.5rem]" : "min-h-[1.5rem]"}>{s.label}</span>)}</div></th>
            {["old", "now", "gap"].map((side) => <td key={side} className="py-3 align-top"><span aria-hidden="true" className="block h-5" /><div className="mt-2 grid gap-3">{summary.map((s) => <div key={s.label} className={s.ap !== undefined ? "min-h-[2.5rem]" : "min-h-[1.5rem]"}>
              <Value votes={side === "old" ? old.present ? s.a : null : side === "now" ? now.present ? s.b : null : old.present && now.present ? s.b - s.a : null}
                share={side === "old" ? s.ap : side === "now" ? s.bp : s.ap === undefined ? undefined : difference(s.ap, s.bp ?? null)} gap={side === "gap"} />
            </div>)}</div></td>)}
          </tr>
          {rows.map((r) => {
            const a = r.votes22 === null ? null : ballotShare(r.votes22, old.valid), b = r.votes26 === null ? null : ballotShare(r.votes26, now.valid);
            return <tr key={r.id} className="border-b border-paper-line">
              <th scope="row" className="py-3 pe-2 text-start font-normal"><span className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 break-words">
                <PartyAvatar id={r.image} size={32} fallback={r.letters === "other" ? "…" : r.letters} />
                <span>{r.name}{r.previousName && r.previousName !== r.name && <span className="block text-xs text-ink-soft">2022: {r.previousName}</span>}</span>
              </span></th>
              <td><Value votes={r.votes22} share={a} /></td><td><Value votes={r.votes26} share={b} /></td>
              <td><Value votes={difference(r.votes22, r.votes26)} share={difference(a, b)} gap /></td>
            </tr>;
          })}
        </tbody>
      </table>
  );
}
