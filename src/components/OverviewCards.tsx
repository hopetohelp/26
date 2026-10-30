import { overview, overviewChangePct, overviewShare } from "../lib/voterFlow";
import { Delta } from "./ParamCard";
import { changeOf } from "../lib/changeMark";
import { num, pctOne } from "../lib/format";

const ITEMS = [["eligible", "בעלי זכות בחירה"], ["voted", "הצביעו"], ["inKnesset", "קולות לרשימות בכנסת"], ["belowThreshold", "לא עברו את אחוז החסימה"]] as const;
type Key = (typeof ITEMS)[number][0];

/**
 * ארבעת הנתונים הכלליים, כרטיס לכל נתון (הכרעת בעלים 29.10.2026): הנתון הנוכחי במספר ובאחוזים, והשינוי במספר ובאחוזים — בלי ערכי 2022.
 * `keys` + `small`: בהטמעת גרפי המעבר — רק "הצביעו" ו"קולות לרשימות בכנסת", בגודל קטן יותר (הכרעת בעלים 30.10.2026)
 */
export default function OverviewCards({ keys, small = false }: { keys?: readonly Key[]; small?: boolean }) {
  const { y2022, y2026 } = overview();
  if (!y2026) return null;
  const items = keys ? ITEMS.filter(([k]) => keys.includes(k)) : ITEMS;
  return <dl className={`grid ${keys ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"} ${small ? "gap-1.5 mt-2" : "gap-2 mt-3"}`}>
    {items.map(([key, label]) => {
      const share = overviewShare(y2026, key);
      const count = changeOf(y2026[key] - y2022[key], "count"), rate = changeOf(overviewChangePct(y2022, y2026, key), "pct");
      const tone = count?.up ? "bg-pos/10" : count ? "bg-neg/10" : "";
      // עיצוב דרמטי (הכרעת בעלים 29.10.2026): מספר גדול, פס עליון בצבע ההדגשה, והשינוי בתג צבעוני
      return <div key={key} className={`rounded-theme border border-paper-line border-t-4 border-t-accent bg-paper-card shadow-md text-center min-w-0 flex flex-col items-center ${small ? "px-1.5 py-2 gap-1" : "px-2 py-3 gap-1.5"}`}>
        <dt className={`font-bold text-ink-soft leading-tight ${small ? "text-[11px] md:text-xs" : "text-xs md:text-sm"}`}>{label}</dt>
        <dd className="contents tabular-nums">
          <bdi dir="ltr" className={`block font-display font-extrabold leading-none text-ink ${small ? "text-base md:text-xl" : "text-xl md:text-3xl"}`}>{num(y2026[key])}</bdi>
          {share !== null && <span className={`font-bold text-accent leading-none ${small ? "text-[11px] md:text-xs" : "text-xs md:text-sm"}`}><bdi dir="ltr">{pctOne(share)}</bdi></span>}
          {count && <span className={`inline-flex flex-wrap justify-center gap-x-1.5 rounded-full px-1.5 py-0.5 font-bold ${small ? "text-[10px] md:text-xs" : "text-[11px] md:gap-x-2 md:px-2 md:text-sm"} ${tone}`}><Delta change={count} /><Delta change={rate} /></span>}
        </dd>
      </div>;
    })}
  </dl>;
}
