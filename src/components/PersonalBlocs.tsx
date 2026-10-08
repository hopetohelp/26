import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import Explained from "./Explained";
import type { BlocsPayload } from "../lib/crowdApi";
import { useSession, useUnit } from "../pages/guess/useCrowd";
import { DEFAULT_BLOCS, IDS, K25_MAP, nameOf, normalizeBlocs } from "../pages/guess/model";
import { seatsFmt } from "../lib/format";
import { blocValues } from "../lib/personalBlocs";

const Context = createContext<ReturnType<typeof useUnit<BlocsPayload>> | null>(null);
export function PersonalBlocsProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const unit = useUnit<BlocsPayload>("blocs", DEFAULT_BLOCS, session.me?.latest.blocs?.payload as BlocsPayload | undefined);
  useEffect(() => { if (unit.draft?.mode === "gov37") unit.setDraft(normalizeBlocs(unit.draft)); }, [unit.draft, unit.setDraft]);
  return <Context.Provider value={unit}>{children}</Context.Provider>;
}
export function usePersonalBlocs() {
  const unit = useContext(Context);
  if (!unit) throw new Error("PersonalBlocsProvider missing");
  return unit;
}
/** חוסר נתון נשאר חוסר נתון; אין השלמה מ-0 ואין חיבור טווחים שוליים. */
export default function PersonalBlocs({ values, source, asOf, historical = false, mapping: suppliedMapping }: {
  values: Record<string, number | undefined>; source: string; asOf: string; historical?: boolean; mapping?: Record<string, string>;
}) {
  const unit = usePersonalBlocs();
  const { pathname, search } = useLocation();
  const p = unit.draft ? normalizeBlocs(unit.draft) : DEFAULT_BLOCS;
  const mapping = suppliedMapping ?? (historical ? K25_MAP : Object.fromEntries(IDS.map(id => [id, id])));
  const rows = blocValues(p.blocs, values, mapping);
  return <section className="my-4 rounded-theme border border-paper-line bg-paper-card p-3 space-y-2" aria-label="מנדטים לפי הגושים שלי">
    <div className="flex justify-between gap-3 items-center flex-wrap"><h3 className="font-display text-2xl">הגושים שלי</h3><Link className="min-h-[44px] flex items-center text-sm font-bold" to={`/guess?section=blocs&return=${encodeURIComponent(pathname + search)}`}>עריכת גושים</Link></div>
    <p className="text-xs text-ink-soft">{source} · {asOf}</p>
    <Explained kind="השוואה" source={source} asOf={asOf} assumption="כל גוש מסכם את המנדטים של מפלגותיו באותו מקור. תרחישים יכולים לחפוף; אין סך גושים. יעד אינו נתון המקור. אין חיבור טווחי מפלגות." methodAnchor="personal-blocs">
      <dl className="space-y-2">{rows.map(row => <div key={row.id} className="flex justify-between gap-3 border-b border-paper-line pb-2 text-sm"><dt className="min-w-0"><strong className="break-words">{row.name}</strong><span className="block text-xs text-ink-soft break-words">{row.lists.map(nameOf).join(" · ") || "אין מפלגות"}</span>{row.missing.length > 0 && <span className="block text-xs text-warn">חסר נתון או אין התאמה מובהקת: {row.missing.map(nameOf).join(" · ")}</span>}</dt><dd className="font-num tabular font-bold shrink-0">{row.total === null ? "—" : `${seatsFmt(row.total)} מנדטים`}</dd></div>)}</dl>
    </Explained>
    <p className="text-xs text-ink-soft">תרחישים עצמאיים וחופפים; אין לחבר את סכומיהם. {unit.status !== "saved" ? "הרכב הגושים הוא טיוטה בדפדפן הזה." : "לפי הרכב הגושים השמור שלכם."}</p>
  </section>;
}
