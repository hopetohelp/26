import { useState } from "react";
import { Link } from "react-router-dom";
import type { SeatsPayload } from "../../lib/crowdApi";
import { fillAll, fillErrorText } from "../../lib/fillAll";
import { start2022 } from "../../lib/lineage";
import { KNESSET_GROUPS } from "../../lib/simpleSources";
import { GUESS_IDS, POLL_RANGES, POLLS, startSeats } from "../guess/model";
import { useCrowd, useLineage } from "../guess/useLineage";
import type { useSession } from "../guess/useCrowd";
import { flashNotice } from "./shared";

const TARGETS_KEY = "elections26.group-targets.v1";
type Targets = Record<string, number | null>;
const loadTargets = (): Targets => { try { return JSON.parse(localStorage.getItem(TARGETS_KEY) ?? "{}"); } catch { return {}; } };

/**
 * כלי המתקדם בעורך הניחוש (הכרעת בעלים 25.10.2026): נקודת פתיחה (מאפס · ממוצע הסקרים · בחירות 22), השלמה שמכבדת נעילות,
 * ויעד מנדטים לכל חלק בחלוקת הכנסת. היעד הוא אילוץ להשלמה בלבד — נשמר בדפדפן, אינו נשלח ואינו נספר.
 */
export default function GuessTools({ draft, setDraft, session }: { draft: SeatsPayload; setDraft: (p: SeatsPayload) => void; session: ReturnType<typeof useSession> }) {
  const lineage = useLineage(session);
  const { seats: crowd } = useCrowd();
  const lin = lineage.draft.split === "crowd" && !crowd ? { ...lineage.draft, split: "polls" as const } : lineage.draft;
  const [targets, setTargets] = useState<Targets>(loadTargets);
  const [error, setError] = useState<string | null>(null);
  const saveTargets = (t: Targets) => { setTargets(t); try { localStorage.setItem(TARGETS_KEY, JSON.stringify(t)); } catch { /* לביקור בלבד */ } };
  const groups = KNESSET_GROUPS.map(g => ({ ...g, lists: g.lists.filter(id => GUESS_IDS.includes(id)), target: targets[g.id] ?? null }));
  const anyFilled = GUESS_IDS.some(id => (draft.seats[id]?.v ?? 0) > 0);
  const start = (kind: "zero" | "polls" | "k25") => {
    if (anyFilled && !window.confirm("להחליף את הניחוש הנוכחי בנקודת פתיחה חדשה?")) return;
    setError(null);
    if (kind === "k25") {
      const seats = Object.fromEntries(Object.entries(start2022(lin, crowd)).filter(([id]) => GUESS_IDS.includes(id)).map(([id, c]) => [id, { v: c.v, src: c.locked ? "manual" as const : "filled" as const, locked: c.locked }]));
      setDraft({ ...startSeats("zero"), start: "k25", seats: { ...startSeats("zero").seats, ...seats } });
    } else setDraft(startSeats(kind));
  };
  const complete = () => {
    const r = fillAll(GUESS_IDS, draft.seats, POLLS, groups, POLL_RANGES);
    if (!r.ok) { setError(fillErrorText(r.error)); return; }
    setError(null);
    const { pct: _pct, calculation: _calc, ...rest } = draft;
    setDraft({ ...rest, mode: "seats", seats: r.seats });
    flashNotice(r.changed.length ? "המנדטים הפנויים הושלמו לפי ממוצע הסקרים" : "אין מה להשלים");
  };
  return <div className="f-tools">
    <div className="f-tools-row" role="group" aria-label="נקודת פתיחה">
      <span className="f-tools-label">להתחיל</span>
      <button type="button" className="f-btn" onClick={() => start("zero")}>מאפס</button>
      <button type="button" className="f-btn" onClick={() => start("polls")}>מממוצע הסקרים</button>
      <button type="button" className="f-btn" onClick={() => start("k25")}>מבחירות 22</button>
      <Link to="/changes" className="f-btn">שיוך 22</Link>
    </div>
    <details className="f-tools-targets">
      <summary>יעד לכל חלק{groups.some(g => g.target !== null) && <span className="f-tools-on"> · פעיל</span>}</summary>
      <p>היעד משמש רק את "השלם הכל"; הוא אינו חלק מהניחוש ואינו נספר.</p>
      <div className="f-tools-grid">{groups.map(g => <label key={g.id}><span>{g.name}</span>
        <input inputMode="numeric" type="text" aria-label={`יעד מנדטים ל${g.name}`} placeholder="—" value={g.target ?? ""} onChange={e => { const t = e.target.value.trim(); if (t !== "" && !/^\d{1,3}$/.test(t)) return; saveTargets({ ...targets, [g.id]: t === "" ? null : Math.min(120, Number(t)) }); }} /></label>)}</div>
    </details>
    <div className="f-tools-row">
      <button type="button" className="f-btn pri" onClick={complete}>השלם הכל</button>
      <span className="f-tools-hint">משלים את המפלגות שאינן נעולות 🔒 לפי ממוצע הסקרים{groups.some(g => g.target !== null) ? " והיעדים" : ""}.</span>
    </div>
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
  </div>;
}
