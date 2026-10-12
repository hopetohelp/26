import { Segmented } from "./Choice";
import Select from "./Select";
import type { GroupRef } from "../lib/crowdApi";

/** עד 3 קבוצות — מתג; יותר מזה — רשימת בחירה. בלי הגבלה על מספר הקבוצות (הכרעת בעלים 12.10.2026) */
export const SCOPE_SEGMENTS = 3;

export default function GroupScope({ groups, value, onChange }: { groups: GroupRef[]; value: string; onChange: (id: string) => void }) {
  const options = [{ id: "all", label: "כל המשתתפים" }, ...groups.map((g) => ({ id: g.id, label: g.name ?? g.id }))];
  if (groups.length > SCOPE_SEGMENTS)
    return <Select id="stats-scope" inline className="max-w-md" label="של מי הסטטיסטיקות" value={value} onChange={onChange}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>;
  return <Segmented className="max-w-md" value={value} onChange={onChange} label="של מי הסטטיסטיקות" options={options} />;
}
