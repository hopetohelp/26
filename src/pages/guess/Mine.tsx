import { useState } from "react";
import { linkAcked, setLinkAck } from "../../lib/crowdSession";
import { type BlocsPayload, type SeatsPayload, type VotePayload } from "../../lib/crowdApi";
import History from "./History";
import LinkSaver from "./LinkSaver";
import Seats from "./Seats";
import { DEFAULT_BLOCS } from "./model";
import Vote from "./Vote";
import { Btn, Notice } from "./ui";
import { useUnit, type useSession } from "./useCrowd";

const SECTIONS = [
  { id: "seats", label: "מנדטים וגושים" },
  { id: "vote", label: "הצבעה" },
  { id: "history", label: "היסטוריה" },
] as const;
type Sec = (typeof SECTIONS)[number]["id"];

export default function Mine({ session, onStatistics }: { session: ReturnType<typeof useSession>; onStatistics: () => void }) {
  const [sec, setSec] = useState<Sec>("seats");
  const latest = session.me?.latest;
  const seats = useUnit<SeatsPayload>("seats", null, latest?.seats?.payload as SeatsPayload | undefined);
  const blocs = useUnit<BlocsPayload>("blocs", DEFAULT_BLOCS, latest?.blocs?.payload as BlocsPayload | undefined);
  const vote = useUnit<VotePayload>("vote", null, latest?.vote?.payload as VotePayload | undefined);


  const [acked, setAcked] = useState(linkAcked);
  // הכרטיס הבולט מופיע מיד אחרי ההרשמה (כשנוצר הקישור האישי), עד שמאשרים ששמרתם
  const showLink = !!session.token && !!session.link && !acked;

  const statusOf = (s: Sec) => (s === "seats" ? (seats.draft && seats.status !== "saved" ? seats : blocs.draft && blocs.status !== "saved" ? blocs : seats) : s === "vote" ? vote : null);
  return (
    <div>
      {!session.online && (
        <div className="mb-4">
          <Notice>השמירה עוד לא פעילה באתר. אפשר כבר לבנות את הכנסת שלכם — הטיוטה נשמרת בדפדפן הזה, ותחכה לכם.</Notice>
        </div>
      )}
      {showLink && session.link && (
        <section className="mb-5 border-2 border-ink rounded-theme p-4 bg-paper-card space-y-2" aria-labelledby="link-first-title">
          <div className="flex items-start justify-between gap-3">
            <h2 id="link-first-title" className="font-display text-3xl leading-none">
              נרשמתם. עכשיו שמרו את הקישור האישי
            </h2>
            <button
              type="button"
              onClick={() => (setLinkAck(true), setAcked(true))}
              className="shrink-0 min-h-[44px] px-4 rounded-full border-2 border-ink bg-ink text-paper-card text-sm font-bold flex items-center gap-1.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              סגירה
            </button>
          </div>
          <p className="text-sm">
            הקישור האישי מכניס אתכם ישר להשערות שלכם, מכל מכשיר, וגם מאפשר לקבוע סיסמה חדשה. האתר לא שומר מייל, ולכן זו הדרך היחידה לשחזר סיסמה שנשכחה.
          </p>
          <LinkSaver token={session.link} />
          <Btn onClick={() => (setLinkAck(true), setAcked(true))}>שמרתי את הקישור</Btn>
        </section>
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
      {sec === "vote" && <Vote unit={vote} session={session} />}
      {sec === "history" && <History session={session} />}
    </div>
  );
}
