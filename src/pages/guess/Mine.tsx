import { useSearchParams, Link } from "react-router-dom";
import { usePersonalBlocs } from "../../components/PersonalBlocs";
import Blocs from "./Blocs";
import { type SeatsPayload, type VotePayload } from "../../lib/crowdApi";
import History from "./History";
import Seats, { HowTo } from "./Seats";
import Vote from "./Vote";
import { Notice } from "./ui";
import { useEffect, useState, useRef } from "react";
import CardDrawer from "../../components/CardDrawer";
import { flushPending, flushUnit, useUnit, type useSession } from "./useCrowd";

const SECTIONS = [
  { id: "seats", label: "המפלגות" },
  { id: "blocs", label: "הגושים" },
  { id: "history", label: "ההשערות שלי" },
] as const;
type Sec = (typeof SECTIONS)[number]["id"];

export default function Mine({ session, seats, onStatistics }: { session: ReturnType<typeof useSession>; seats: ReturnType<typeof useUnit<SeatsPayload>>; onStatistics: () => void }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section");
  // ההצבעה במגירת פרטים נוספים; קישור ישן פותח אותה וגולל אליה.
  const [voteOpen, setVoteOpen] = useState(requested === "vote");
  const voteCard = useRef<HTMLDivElement>(null);
  useEffect(() => { if (requested === "vote") { setVoteOpen(true); voteCard.current?.scrollIntoView({ block: "start" }); } }, [requested]);
  const sec: Sec = SECTIONS.some(s => s.id === requested) ? requested as Sec : "seats";
  // הלשונית "האחוזים" אוחדה עם "המפלגות" (מתג מנדטים | אחוזים, הכרעת בעלים 10.10.2026): קישור ישן נפתח במצב אחוזים
  useEffect(() => {
    if (requested !== "calculator") return;
    const next = new URLSearchParams(params); next.set("section", "seats"); next.set("unit", "pct");
    setParams(next, { replace: true });
  }, [requested]); // eslint-disable-line react-hooks/exhaustive-deps
  const setSec = (value: Sec) => { const next = new URLSearchParams(params); next.set("section", value); setParams(next, { replace: true }); };
  const back = params.get("return");
  const latest = session.me?.latest;
  const blocs = usePersonalBlocs();
  const vote = useUnit<VotePayload>("vote", null, latest?.vote?.payload as VotePayload | undefined);
  // יציאה ממסך "הכנסת שלי" ⇐ שמירת מה שלא נשמר
  useEffect(() => flushPending, []);



  const statusOf = (s: Sec) => s === "seats" ? seats.status !== "saved" ? seats : blocs : s === "blocs" ? blocs : null;
  return (
    <div>
      {session.me?.seatsPending && sec === "seats" && (
        <div className="mb-4"><Notice>ההשערה שלכם כוללת ערך חריג לעומת שאר המשתתפים, ולכן תיכנס לסטטיסטיקות אחרי בדיקה של צוות האתר. היא שמורה, ואפשר להמשיך לערוך אותה.</Notice></div>
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
      {sec === "blocs" && <><Blocs unit={blocs} session={session} mySeats={seats.draft ? Object.fromEntries(Object.entries(seats.draft.seats).map(([id, c]) => [id, c.v])) : null} />{back && /^\/(?!\/)/.test(back) && <Link className="block min-h-[44px] mt-4" to={back}>חזרה למסך הקודם</Link>}</>}
      {sec === "history" && <History session={session} />}
      <HowTo />
      <div ref={voteCard} className="scroll-mt-32"><CardDrawer title="ההצבעות שלכם בבחירות עוזרות להבין את התמונה" open={voteOpen} onOpenChange={(v) => { setVoteOpen(v); if (!v) flushUnit("vote"); }} seenId="vote" pendingTag={vote.status === "saved" ? undefined : "מחכה לתשובה"} dot={vote.status !== "saved"} className="mb-5">
        <Vote unit={vote} session={session} />
      </CardDrawer></div>

    </div>
  );
}
