import { Link } from "react-router-dom";
import { PageTitle } from "../../components/ui";
import { IDS } from "../guess/model";
import { simpleValue } from "../../lib/simpleSources";
import { PartyName, PollExplanation, SimpleBlocs, SimpleFooter, SimpleSourcePicker, SimpleTable, number, useSimpleSource } from "./shared";
export default function Overview() {
  const source = useSimpleSource();
  const rows = IDS.map(id => ({ id, value: simpleValue(source.selection, [id]) })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return <div className="simple-page max-w-4xl mx-auto"><PageTitle>תמונת מצב</PageTitle><SimpleSourcePicker source={source} />
    <PollExplanation><SimpleTable label="המנדטים בסקרים" headers={["מנדטים"]} rows={rows.map(r => ({ id: r.id, label: <PartyName id={r.id} />, cells: [<strong>{number(r.value)}</strong>] }))} /><SimpleBlocs of={ids => simpleValue(source.selection, ids)} /></PollExplanation>
    <Link to="/guess?view=edit" className="c-button inline-flex items-center min-h-[44px] mt-6 px-5 rounded-full bg-signal text-signal-ink font-bold no-underline">בונים את הכנסת שלי</Link><SimpleFooter /></div>;
}
