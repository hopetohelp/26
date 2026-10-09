import { useSearchParams, Link } from "react-router-dom";
import { usePersonalBlocs } from "../../components/PersonalBlocs";
import Blocs from "./Blocs";
import Calculator from "../Calculator";
import { type SeatsPayload, type VotePayload } from "../../lib/crowdApi";
import History from "./History";
import Seats from "./Seats";
import Vote from "./Vote";
import { Notice } from "./ui";
import { useUnit, type useSession } from "./useCrowd";

const SECTIONS = [
  { id: "seats", label: "המפלגות" },
  { id: "blocs", label: "הגושים" },
  { id: "calculator", label: "האחוזים" },
  { id: "vote", label: "ההצבעה שלי" },
  { id: "history", label: "ההשערות שלי" },
] as const;
type Sec = (typeof SECTIONS)[number]["id"];

export default function Mine({ session, onStatistics }: { session: ReturnType<typeof useSession>; onStatistics: () => void }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section");
  const sec: Sec = SECTIONS.some(s => s.id === requested) ? requested as Sec : "seats";
  const setSec = (value: Sec) => { const next = new URLSearchParams(params); next.set("section", value); setParams(next, { replace: true }); };
  const back = params.get("return");
  const latest = session.me?.latest;
  const seats = useUnit<SeatsPayload>("seats", null, latest?.seats?.payload as SeatsPayload | undefined);
  const blocs = usePersonalBlocs();
  const vote = useUnit<VotePayload>("vote", null, latest?.vote?.payload as VotePayload | undefined);



  const statusOf = (s: Sec) => s === "seats" ? seats.status !== "saved" ? seats : blocs : s === "calculator" ? seats : s === "blocs" ? blocs : s === "vote" ? vote : null;
  return (
    <div>
      {!session.online && (
        <div className="mb-4">
          <Notice>השמירה עוד לא פעילה באתר. אפשר כבר לבנות את הכנסת שלכם — הטיוטה נשמרת בדפדפן הזה, ותחכה לכם.</Notice>
        </div>
      )}
      {/* הקישור האישי וההמלצה להירשם — בכרטיס הגישה הכללי (AccessCard) בראש כל עמוד */}
      {!session.token && session.online && (
        <div className="mb-4"><Notice>כל שינוי נשמר אוטומטית ונכנס לממוצע האנונימי של הגולשים. בשינוי הראשון נוצר לכם קישור אישי לחזרה.</Notice></div>
      )}
      <nav aria-label="חלקי ההשערה" className="flex gap-1 overflow-x-auto -mx-4 px-4 pb-1 mb-5 border-b border-paper-line">
        {SECTIONS.map((s) => {
          const on = sec === s.id;
          const u = statusOf(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => setSec(s.id)}
              className={`shrink-0 min-h-[44px] px-3 text-sm font-bold border-b-4 -mb-[1px] flex items-center gap-1.5 ${on ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
            >
              {s.label}
              {u && u.draft && u.status !== "saved" && <span aria-label="(לא נשמר)" className="w-2 h-2 rounded-full bg-warn" />}
            </button>
          );
        })}
      </nav>
      {sec === "seats" && <Seats unit={seats} session={session} blocsUnit={blocs} onStatistics={onStatistics} />}
      {sec === "calculator" && <Calculator session={session} unit={seats} blocsUnit={blocs} />}
      {sec === "blocs" && <><Blocs unit={blocs} session={session} mySeats={seats.draft ? Object.fromEntries(Object.entries(seats.draft.seats).map(([id, c]) => [id, c.v])) : null} />{back && /^\/(?!\/)/.test(back) && <Link className="block min-h-[44px] mt-4" to={back}>חזרה למסך הקודם</Link>}</>}
      {sec === "vote" && <Vote unit={vote} session={session} />}
      {sec === "history" && <History session={session} />}
    </div>
  );
}
