import { useSearchParams, Link } from "react-router-dom";
import { usePersonalBlocs } from "../../components/PersonalBlocs";
import Blocs from "./Blocs";
import { type SeatsPayload, type VotePayload } from "../../lib/crowdApi";
import History from "./History";
import Seats, { HowTo } from "./Seats";
import Vote from "./Vote";
import { Btn, Notice } from "./ui";
import { HistoryLink } from "./GuessIntro";
import { useCallback, useEffect, useState, useRef } from "react";
import { useOpenVote } from "./ClosedNote";
import CardDrawer from "../../components/CardDrawer";
import { flushPending, flushUnit, useUnit, type useSession } from "./useCrowd";

type Sec = "seats" | "blocs" | "history";

export default function Mine({ session, seats, complete, shared, onStatistics }: { session: ReturnType<typeof useSession>; seats: ReturnType<typeof useUnit<SeatsPayload>>; complete: boolean; shared: boolean; onStatistics: () => void }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section");
  // ההצבעה במגירת פרטים נוספים; קישור ישן פותח אותה וגולל אליה.
  const [voteOpen, setVoteOpen] = useState(requested === "vote");
  const voteCard = useRef<HTMLDivElement>(null);
  useOpenVote(useCallback(() => { setVoteOpen(true); voteCard.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, []));
  useEffect(() => { if (requested === "vote") { setVoteOpen(true); voteCard.current?.scrollIntoView({ block: "start" }); } }, [requested]);
  const sec: Sec = requested === "blocs" || requested === "history" ? requested : "seats";
  // הלשונית "האחוזים" אוחדה עם "המפלגות" (מתג מנדטים | אחוזים, הכרעת בעלים 10.10.2026): קישור ישן נפתח במצב אחוזים
  useEffect(() => {
    if (requested !== "calculator") return;
    const next = new URLSearchParams(params); next.set("section", "seats"); next.set("unit", "pct");
    setParams(next, { replace: true });
  }, [requested]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = params.get("return");
  const returnTo = back && /^\/(?!\/)/.test(back) ? back : "/guess?view=edit";
  const latest = session.me?.latest;
  const blocs = usePersonalBlocs();
  const vote = useUnit<VotePayload>("vote", null, latest?.vote?.payload as VotePayload | undefined);
  // יציאה ממסך "הכנסת שלי" ⇐ שמירת מה שלא נשמר
  useEffect(() => flushPending, []);



  return (
    <div>
      {session.me?.seatsPending && sec === "seats" && (
        <div className="mb-4"><Notice>הניחוש שלכם כולל ערך חריג לעומת שאר המשתתפים, ולכן ייכנס לסטטיסטיקות אחרי בדיקה של צוות האתר. הוא שמור, ואפשר להמשיך לערוך אותו.</Notice></div>
      )}
      {sec !== "seats" ? <div className="flex flex-wrap gap-2 mb-4"><Link className="c-chart-link" to={returnTo}>חזרה למסך הקודם ←</Link></div> : shared && <div className="flex flex-wrap gap-2 mb-4"><HistoryLink /></div>}
      {/* סדר המגירות (הכרעת בעלים 18.10.2026): הכנסת הושלמה · ההצבעות שלי · איך בונים · הגושים שלי (ב-`Seats`) */}
      {sec === "seats" && <div className="c-stage-notice" role="status">{complete ? "הכנסת הושלמה. אפשר להמשיך לערוך או לצפות בממוצע הניחושים." : "הצפייה בממוצע הניחושים תיפתח אחרי השלמת הכנסת: 120 מנדטים, ולכל רשימה 0 או לפחות 4."}{complete && <Btn onClick={onStatistics}>לממוצע הניחושים ←</Btn>}</div>}
      {sec === "seats" && <div ref={voteCard} className="scroll-mt-32"><CardDrawer title="ההצבעות שלי" open={voteOpen} onOpenChange={(v) => { setVoteOpen(v); if (!v) flushUnit("vote"); }} seenId="vote" pendingTag={vote.status === "saved" ? undefined : "מחכה לתשובה"} dot={vote.status !== "saved"} className="mb-5">
        <Vote unit={vote} session={session} />
      </CardDrawer></div>}
      {sec === "seats" && !shared && <HowTo signedIn={!!session.token} />}
      {sec === "seats" && <Seats unit={seats} session={session} blocsUnit={blocs} onStatistics={onStatistics} />}
      {sec === "blocs" && <Blocs unit={blocs} session={session} mySeats={seats.draft ? Object.fromEntries(Object.entries(seats.draft.seats).map(([id, c]) => [id, c.v])) : null} />}
      {sec === "history" && <History session={session} />}

    </div>
  );
}
