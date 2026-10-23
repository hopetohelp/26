import { IDS } from "../guess/model";
import { simpleValue } from "../../lib/simpleSources";
import { BlocChart, FocusFoot, LegendCapsule, LegendLine, PartyChart, SourceBar, orderedLists, useSimpleSource } from "./shared";
/** תמונת מצב: קפסולות הסקרים וממוצע המקור הנבחר, וסיכום הגושים */
export default function Overview() {
  const source = useSimpleSource();
  const values = Object.fromEntries(IDS.map(id => [id, simpleValue(source.selection, [id])]));
  return <div className="max-w-6xl mx-auto"><h1 className="sr-only">תמונת מצב</h1><SourceBar source={source} />
    <div className="f-grid"><PartyChart selection={source.selection} lists={orderedLists(source.selection)} marks={id => [{ value: values[id], side: "up" }]} legend={<><LegendCapsule /><LegendLine label="ממוצע" /></>} />
      <div className="f-side"><BlocChart values={values} /></div></div>
    <FocusFoot /></div>;
}
