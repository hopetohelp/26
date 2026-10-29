import { useMemo } from "react";
import InfoTip from "./InfoTip";
import ParamCard, { PARAM_NAMES, type ParamRow } from "./ParamCard";
import { PartyAvatar } from "./PartyAvatar";
import { num, pctOne } from "../lib/format";
import { ballotView, partyParams, type BallotFilter, type BallotUnits } from "../lib/ballotLookup";

/**
 * השוואת 2022 מול 2026 ליחידה אחת (עיר, קלפי או תת קלפי) בכרטיסים באותו עיצוב כמו כרטיס המפלגה (הכרעת בעלים 29.10.2026):
 * כרטיס "נתוני הצבעה" וכרטיס לכל מפלגה עם שלושה פרמטרים. מנדטים אינם קיימים ברמה הזאת.
 */
export default function BallotCards({ units, filter, label }: { units: BallotUnits; filter: BallotFilter; label?: string }) {
  const view = useMemo(() => ballotView(units, filter), [units, filter]);
  const { old, now, rows, selected } = view;
  if (!old.present && !now.present) return <p role="status">לא נמצאו קלפיות מתאימות.</p>;
  const pick = <T,>(present: boolean, v: T) => (present ? v : null);
  const summary: ParamRow[] = [
    { key: "eligible", label: "בעלי זכות בחירה", v22: pick(old.present, old.eligible), v26: pick(now.present, now.eligible), fmt: num, kind: "count" },
    { key: "voters", label: PARAM_NAMES.votes, v22: pick(old.present, old.voters), v26: pick(now.present, now.voters), fmt: num, kind: "count" },
    { key: "turnout", label: "אחוז הצבעה", v22: pick(old.present, old.turnout), v26: pick(now.present, now.turnout), fmt: pctOne, kind: "pct" },
  ];
  const { status } = selected;
  return <div className="space-y-3">
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-soft">
      <span>השוואה: <b className="text-ink">{status.label}</b>{selected.estimated && " · 2022 באומדן מותאם"}</span>
      {status.reason.length > 35 ? <InfoTip label="הסבר רמת ההשוואה">{status.reason}</InfoTip> : status.reason && <span className="text-xs">({status.reason})</span>}
    </p>
    <section aria-label={`נתוני הצבעה ל־${label || "הסינון הנבחר"}`}>
      <h3 className="font-bold mb-1">נתוני הצבעה</h3>
      <ParamCard rows={summary} caption="נתוני הצבעה: 2022, 2026 והפער" />
    </section>
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => {
        const p = partyParams(view, r);
        const pr = (key: keyof typeof PARAM_NAMES, v: { v22: number | null; v26: number | null }, fmt: (n: number) => string, kind: "count" | "pct"): ParamRow => ({ key, label: PARAM_NAMES[key], ...v, fmt, kind });
        return <section key={r.id} aria-label={r.name} className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PartyAvatar id={r.image} size={32} fallback={r.letters === "other" ? "…" : r.letters} />
            <h3 className="font-bold leading-tight break-words">{r.name}{r.previousName && r.previousName !== r.name && <span className="block text-xs font-normal text-ink-soft">2022: {r.previousName}</span>}</h3>
          </div>
          <ParamCard compact caption={`${r.name}: מצביעים, מזכות בחירה ומהכשרים ב־2022 וב־2026 והפער`}
            rows={[pr("votes", p.votes, num, "count"), pr("ofEligible", p.ofEligible, pctOne, "pct"), pr("ofValid", p.ofValid, pctOne, "pct")]} />
        </section>;
      })}
    </div>
  </div>;
}
