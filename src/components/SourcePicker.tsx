import { useId } from "react";
import { useNavigate } from "react-router-dom";
import { DATA_PRODUCTS, SCREEN_POLICY, type DataScreen } from "../lib/dataCatalog";
import { SOURCE_OPTIONS, type Selection } from "../lib/dataResolver";
import { SHOW_MODEL } from "../lib/modelVisibility";

export default function SourcePicker({ screen, selection, onChange }: { screen: DataScreen; selection: Selection; onChange: (s: Selection) => void; notice?: string | null }) {
  const id = useId();
  const navigate = useNavigate();
  const allowed = SCREEN_POLICY[screen] as readonly string[];
  const value = selection.product === "poll.single" ? selection.source ?? "" : selection.product;
  const label = selection.product === "poll.single" ? SOURCE_OPTIONS.find(o => o.id === selection.source)?.label ?? "מקור נתונים" : DATA_PRODUCTS[selection.product].name;
  return <div className="c-source-row"><div className="c-source-picker">
    <label htmlFor={id} className="sr-only">מקור הנתונים</label>
    <span aria-hidden="true" className="c-source-width">{label}</span>
    <select id={id} value={value} onChange={e => {
      const v = e.target.value;
      if (v === "explain") { navigate("/method#means"); return; }
      onChange(v in DATA_PRODUCTS ? { product: v as Selection["product"] } : { product: "poll.single", source: v });
    }}>
      <option value="explain">הסבר ובחירה קבועה</option>
      {Object.entries(DATA_PRODUCTS).filter(([k]) => k !== "poll.single" && (SHOW_MODEL || k !== "model.mean") && allowed.includes(k)).map(([k, d]) => <option value={k} key={k}>{d.name}</option>)}
      {allowed.includes("poll.single") && <optgroup label="מכונים ומזמינים">{SOURCE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>}
    </select>
  </div></div>;
}
