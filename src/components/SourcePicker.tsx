import { useId, useState } from "react";
import Select from "./Select";
import InfoTip from "./InfoTip";
import { DATA_PRODUCTS, SCREEN_POLICY, type DataScreen } from "../lib/dataCatalog";
import { SOURCE_OPTIONS, type Selection } from "../lib/dataResolver";
import { saveSourcePreference } from "../lib/sourcePreference";
export default function SourcePicker({ screen, selection, onChange, notice }: { screen: DataScreen; selection: Selection; onChange: (s: Selection) => void; notice?: string | null }) {
  const id = useId();
  const [saved, setSaved] = useState<string | null>(null);
  const def = DATA_PRODUCTS[selection.product];
  const option = SOURCE_OPTIONS.find(o => o.id === selection.source);
  const allowed = SCREEN_POLICY[screen] as readonly string[];
  const value = selection.product === "poll.single" ? selection.source ?? "" : selection.product;
  return <div className="my-4 space-y-2">
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Select id={id} label="מקור הנתונים" value={value} className="min-w-0 max-w-full basis-64" inline onChange={v => { setSaved(null); onChange(v in DATA_PRODUCTS ? { product: v as Selection["product"] } : { product: "poll.single", source: v }); }}>
        {Object.entries(DATA_PRODUCTS).filter(([k]) => k !== "poll.single" && allowed.includes(k)).map(([k, d]) => <option value={k} key={k}>{d.name}</option>)}
        {allowed.includes("poll.single") && <optgroup label="מכונים ומזמינים">{SOURCE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>}
      </Select>
      <InfoTip label="הסבר על מקור הנתונים" methodAnchor={def.method}>{option && selection.product === "poll.single" ? option.explain : def.explain}<p className="mt-2">{def.missing}</p>{notice && <p className="mt-2">{notice}</p>}</InfoTip>
      <button type="button" className="min-h-[44px] px-3 text-sm text-accent underline" onClick={() => { void saveSourcePreference(selection).then(where => setSaved(where === "account" ? "נשמר בחשבון" : where === "local" ? "נשמר בדפדפן" : "נשמר לביקור הזה")).catch(() => setSaved("השמירה לחשבון לא הושלמה; אפשר לנסות שוב")); }}>שמירה כמקור המועדף</button>
    </div>
    {saved && <p role="status" className="text-sm text-ink-soft text-center">{saved}</p>}
  </div>;
}
