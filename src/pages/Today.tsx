import { useSourcePreference } from "../lib/sourcePreference";
import { CURRENT_POLLS, selectedPolls, resolveDataset, type Selection } from "../lib/dataResolver";
import { DATA_PRODUCTS, POLL_WINDOW_DAYS } from "../lib/dataCatalog";
import { useState } from "react";
import PersonalBlocs from "../components/PersonalBlocs";
import Explained from "../components/Explained";
import Select from "../components/Select";
import { Segmented } from "../components/Choice";
import { BarSlots } from "../components/ChartLegend";
import { AllParties, PartyByPollster, PollsterByParty, PollsterGrid } from "../components/latestCharts";
import { ChartWithTable, Note, Split } from "../components/ui";
import { lists2026, listName, passesInMost, pollsterLabel, seatsIn, summarize } from "../lib/data";
import { date, seatsFmt } from "../lib/format";
import { MODEL_AVERAGE } from "../lib/sources";

const WINDOW_DAYS = POLL_WINDOW_DAYS;
const ALL = "all";
type View = "party" | "pollster";

/** סיכום מהספק המשותף, ומתחתיו השוואת הפרסומים המקוריים. */
export default function Today() {
  const asOf = MODEL_AVERAGE.asOf;
  const preference = useSourcePreference("today");
  const [temporary, setTemporary] = useState<Selection | null>(null);
  const selection = temporary ?? preference.selection;
  const latest = selectedPolls(selection);
  const dataset = resolveDataset(selection, "today");
  const def = DATA_PRODUCTS[selection.product];
  const firms = [...new Map(CURRENT_POLLS.map(p => [p.firm, p.firmHe])).entries()].sort((a, b) => a[1].localeCompare(b[1], "he"));
  const chosen = selection.firms ?? firms.map(([id]) => id);
  const selectedRows = lists2026.map(l => ({ id: l.id, value: dataset.seats[l.id] })).filter(r => r.value !== undefined).sort((a, b) => b.value - a.value);
  const maximum = Math.max(1, ...selectedRows.map(r => r.value));
  const ids = lists2026.map((l) => l.id);
  const summary = summarize(latest, ids);
  const above = summary.filter(passesInMost);
  const below = summary.filter((s) => !passesInMost(s));
  const [view, setView] = useState<View>("party");
  const [party, setParty] = useState(ALL);
  const poll = latest.length === 1 ? latest[0] : undefined;
  // "מקרא" באותה שורה עם המתג והרשימה (הכרעת בעלים 11.10.2026): הכפתור "נשלח" לכאן מתוך הגרף, והפאנל הפתוח מתחת לשורה
  const [legendRow, setLegendRow] = useState<HTMLElement | null>(null);
  const [legendPanel, setLegendPanel] = useState<HTMLElement | null>(null);

  const lead = `${latest.length} סדרות מכון–מזמין, הפרסום האחרון של כל סדרה ב-${WINDOW_DAYS} הימים שעד ${date(asOf)}.`;
  return (
    <BarSlots.Provider value={{ row: legendRow, panel: legendPanel }}>
    <Split
      title="מה אומרים הסקרים היום?"
      lead={lead}
      primary={
        <div className="mb-8 c-poll-controls"><section className="c-average-explainer" aria-label="שני הממוצעים"><h2 className="text-xl font-display">שתי דרכים לקרוא את הסקרים</h2><div className="c-average-options">{(["polls.mean", "polls.adjusted"] as const).map(id => <button key={id} type="button" aria-pressed={selection.product === id} onClick={() => setTemporary({ product: id, ...(selection.firms ? { firms: selection.firms } : {}) })}><strong>{DATA_PRODUCTS[id].name}</strong><span>{DATA_PRODUCTS[id].explain}</span></button>)}</div><p className="text-sm text-ink-soft">{def.assumption}. <a href={`#/method#${def.method}`}>הסבר מלא</a></p></section>

        <details className="mt-4 border-y border-paper-line py-3"><summary className="font-bold cursor-pointer">הרכבת ממוצע אישי לפי מכונים{selection.firms ? ` (${chosen.length})` : ''}</summary>
          <p className="text-sm my-3">בחרו אילו מכונים לכלול. לכל סדרת מכון–מזמין משקל שווה, לפי הסקר האחרון בחלון של 14 יום. למכון שמפרסם לכמה מזמינים עשויות להיכלל כמה סדרות. הבחירה משפיעה על הנתונים והגרפים במסך זה.</p>
          <div className="flex flex-wrap gap-3">{firms.map(([id, name]) => <label className="flex items-center gap-2 p-2" key={id}><input type="checkbox" checked={chosen.includes(id)} onChange={e => setTemporary({ product: selection.product === 'polls.adjusted' ? 'polls.adjusted' : 'polls.mean', firms: e.target.checked ? [...chosen, id] : chosen.filter(f => f !== id) })} />{name}</label>)}</div>
          {!chosen.length && <p role="status">בחרו לפחות מכון אחד להצגת הממוצע.</p>}
          <button className="mt-3 text-signal underline" type="button" onClick={() => setTemporary({ product: selection.product === 'polls.adjusted' ? 'polls.adjusted' : 'polls.mean' })}>חזרה לכל המכונים</button>
        </details></div>
      }
      secondary={
        <>
          <section aria-label="הנתון הנבחר" className="mb-8"><h2 className="font-display text-xl mb-4">{def.name}{selection.firms ? " — אישי" : ""}</h2><Explained kind={selection.product === "model.mean" ? "תרחיש" : selection.product === "polls.adjusted" ? "חישוב לפי החוק" : "סיכום סקרים"} source={def.source} asOf={date(asOf)} assumption={def.assumption} methodAnchor={def.method}><ChartWithTable chart={<div className="c-poll-bars">{selectedRows.map(r => <div key={r.id}><span>{listName(r.id)}</span><i style={{ width: `${r.value / maximum * 100}%` }} /><b>{seatsFmt(r.value)}</b></div>)}</div>} table={<table className="w-full text-sm"><caption>{def.name}</caption><thead><tr><th>רשימה</th><th>מנדטים</th></tr></thead><tbody>{selectedRows.map(r => <tr key={r.id}><th>{listName(r.id)}</th><td>{seatsFmt(r.value)}</td></tr>)}</tbody></table>} /></Explained></section><details className="c-poll-comparison" open><summary className="font-display text-xl py-3 cursor-pointer">הפרסומים המקוריים — השוואה בין המכונים</summary><section aria-label="הסקרים האחרונים">
        <div className="flex items-center gap-2">
          <Segmented
            label="הצגה"
            value={view}
            onChange={setView}
            tight
            className="w-max shrink-0"
            options={[{ id: "party", label: "לפי מפלגה" }, { id: "pollster", label: "לפי מכון" }]}
          />
          {view === "party" ? (
            <Select inline className="min-w-0" id="today-party" label="מפלגה" value={party} onChange={setParty}>
              <option value={ALL}>כל המפלגות</option>
              {summary.map((s) => <option key={s.id} value={s.id}>{listName(s.id)}</option>)}
            </Select>
          ) : null}
          <div ref={setLegendRow} className="ms-auto shrink-0 flex items-center" />
        </div>
        <div ref={setLegendPanel} />
            <Explained
              bare
              kind="סיכום סקרים"
              source="טבלאות הסקרים בוויקיפדיה האנגלית, עם קישור לפרסום המקורי של כל סקר"
              asOf={`הסקרים שפורסמו עד ${date(asOf)}`}
              assumption="כל מכון נספר פעם אחת (הסקר האחרון שלו). סיכום תיאורי של מה שפורסם, בלי מודל ובלי תרחישים."
              methodAnchor="current"
            >
              {view === "party" ? (
                party === ALL ? <AllParties polls={latest} parties={above} /> : <PartyByPollster id={party} polls={latest} />
              ) : poll ? (
                <PollsterByParty poll={poll} polls={latest} parties={above} />
              ) : (
                <PollsterGrid polls={latest} parties={above} />
              )}
            </Explained>
            {below.length > 0 && (view === "pollster" || party === ALL) && (
              <Note>
                מתחת לאחוז החסימה אצל רוב המכונים:{" "}
                {below.map((s) => `${listName(s.id)} (עוברת אצל ${s.passing} מתוך ${s.n})`).join(" · ")}.
              </Note>
            )}
          </section>

          </details><section aria-label="הגושים שלי בכל סקר" className="mt-10">
            <PersonalBlocs
              title="הגושים שלי בכל אחד מהסקרים"
              source="הסקר האחרון של כל מכון, כל מקור בנפרד"
              asOf={date(asOf)}
              datasets={latest.map((p) => ({ poll: p, values: Object.fromEntries(ids.map((id) => [id, seatsIn(p, id)])), source: pollsterLabel(p), asOf: date(p.end) }))}
            />
          </section>
        </>
      }
    />
    </BarSlots.Provider>
  );
}
