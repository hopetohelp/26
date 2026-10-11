import { useState } from "react";
import { Link } from "react-router-dom";
import PersonalBlocs from "../components/PersonalBlocs";
import Explained from "../components/Explained";
import Select from "../components/Select";
import { Segmented } from "../components/Choice";
import { AllParties, PartyByPollster, PollsterByParty, PollsterGrid } from "../components/latestCharts";
import { Note, Split } from "../components/ui";
import { lists2026, listName, passesInMost, pollsterLabel, seatsIn, summarize } from "../lib/data";
import { date } from "../lib/format";
import { LATEST_POLLS } from "../lib/homeData";
import { POLL_AVERAGE } from "../lib/sources";

const WINDOW_DAYS = 14;
const ALL = "all";
type View = "party" | "pollster";

/**
 * המצב היום (הכרעת בעלים 11.10.2026): רק הסקר האחרון של כל מכון ב-14 הימים האחרונים, בלי מודל ובלי תרחישים
 * (אלה בלשונית "תרחישים"; כל הסקרים — ב"סקרים ומגמות").
 * מתג: לפי מפלגה / לפי מכון, ורשימת בחירה: כולן או אחת. מתחת — הגושים האישיים בכל אחד מהסקרים.
 */
export default function Today() {
  const asOf = POLL_AVERAGE.asOf;
  const latest = LATEST_POLLS;
  const ids = lists2026.map((l) => l.id);
  const summary = summarize(latest, ids);
  const above = summary.filter(passesInMost);
  const below = summary.filter((s) => !passesInMost(s));
  const [view, setView] = useState<View>("party");
  const [party, setParty] = useState(ALL);
  const [pollster, setPollster] = useState(ALL);
  const poll = latest.find((p) => p.id === pollster);

  const lead = `${latest.length} מכונים, הסקר האחרון של כל אחד ב-${WINDOW_DAYS} הימים שעד ${date(asOf)}. כל מכון נספר פעם אחת.`;
  return (
    <Split
      title="המצב היום"
      lead={lead}
      primary={
        <div className="space-y-4 mb-8">
          <Segmented
            label="הצגה"
            value={view}
            onChange={setView}
            options={[{ id: "party", label: "לפי מפלגה" }, { id: "pollster", label: "לפי מכון" }]}
          />
          {view === "party" ? (
            <Select id="today-party" label="מפלגה" value={party} onChange={setParty}>
              <option value={ALL}>כל המפלגות</option>
              {summary.map((s) => <option key={s.id} value={s.id}>{listName(s.id)}</option>)}
            </Select>
          ) : (
            <Select id="today-pollster" label="מכון" value={pollster} onChange={setPollster}>
              <option value={ALL}>כל המכונים</option>
              {latest.map((p) => <option key={p.id} value={p.id}>{pollsterLabel(p)} · {date(p.end)}</option>)}
            </Select>
          )}
          <p className="text-sm text-ink-soft">
            כל הסקרים לאורך זמן: <Link to="/polls">סקרים ומגמות</Link>. טווחים ליום הבחירות: <Link to="/today?tab=scenarios">תרחישים</Link>.
          </p>
        </div>
      }
      secondary={
        <>
          <section aria-label="הסקרים האחרונים">
            <Explained
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

          <section aria-label="הגושים שלי בכל סקר" className="mt-10">
            <PersonalBlocs
              title="הגושים שלי בכל אחד מהסקרים"
              source="הסקר האחרון של כל מכון, כל מקור בנפרד"
              asOf={date(asOf)}
              open
              datasets={latest.map((p) => ({ poll: p, values: Object.fromEntries(ids.map((id) => [id, seatsIn(p, id)])), source: pollsterLabel(p), asOf: date(p.end) }))}
            />
          </section>
        </>
      }
    />
  );
}
