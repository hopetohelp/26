import { useEffect, useMemo, useState } from "react";
import { linkAcked, setLinkAck } from "../../lib/crowdSession";
import { call, type BlocsPayload, type Dashboard, type SeatsPayload, type VotePayload } from "../../lib/crowdApi";
import Blocs from "./Blocs";
import History from "./History";
import LinkSaver, { FORGOT_LINE } from "./LinkSaver";
import MyData from "./MyData";
import Seats from "./Seats";
import Vote from "./Vote";
import { Btn, Notice } from "./ui";
import { useUnit, type useSession } from "./useCrowd";

const SECTIONS = [
  { id: "seats", label: "מנדטים" },
  { id: "blocs", label: "גושים" },
  { id: "vote", label: "הצבעה" },
  { id: "history", label: "היסטוריה" },
  { id: "data", label: "הנתונים שלי" },
] as const;
type Sec = (typeof SECTIONS)[number]["id"];

export default function Mine({ session }: { session: ReturnType<typeof useSession> }) {
  const [sec, setSec] = useState<Sec>("seats");
  const latest = session.me?.latest;
  const seats = useUnit<SeatsPayload>("seats", null, latest?.seats?.payload as SeatsPayload | undefined);
  const blocs = useUnit<BlocsPayload>("blocs", null, latest?.blocs?.payload as BlocsPayload | undefined);
  const vote = useUnit<VotePayload>("vote", null, latest?.vote?.payload as VotePayload | undefined);
  const mySeats = useMemo(() => (seats.draft ? Object.fromEntries(Object.entries(seats.draft.seats).map(([k, c]) => [k, c.v])) : null), [seats.draft]);

  const [crowd, setCrowd] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!session.online) return;
    call<Dashboard>("/dashboard")
      .then((d) => d.open && d.seats && setCrowd(Object.fromEntries(d.seats.full.map((s) => [s.list, s.median]))))
      .catch(() => {});
  }, [session.online]);

  const [acked, setAcked] = useState(linkAcked);
  // הכרטיס הבולט מופיע מיד אחרי השמירה הראשונה (כשנוצר הקישור), עד שמאשרים ששמרתם
  const showLink = !!session.link && !acked && !!(seats.saved || blocs.saved || vote.saved);

  const statusOf = (s: Sec) => (s === "seats" ? seats : s === "blocs" ? blocs : s === "vote" ? vote : null);
  return (
    <div>
      {!session.online && (
        <div className="mb-4">
          <Notice>השמירה עוד לא פעילה באתר. אפשר כבר לבנות את הכנסת שלכם — הטיוטה נשמרת בדפדפן הזה, ותחכה לכם.</Notice>
        </div>
      )}
      {showLink && session.link && (
        <section className="mb-5 border-2 border-ink rounded-theme p-4 bg-paper-card space-y-2" aria-labelledby="link-first-title">
          <h2 id="link-first-title" className="font-display text-3xl leading-none">
            נשמר. עכשיו שמרו את הקישור האישי
          </h2>
          <p className="text-sm">
            הקישור הוא המפתח להשערות שלכם מכל מכשיר, והדרך היחידה לשחזר אותן — האתר לא שומר שם ולא מייל. {FORGOT_LINE}
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
      {sec === "seats" && <Seats unit={seats} session={session} blocs={blocs.draft} crowd={crowd} />}
      {sec === "blocs" && <Blocs unit={blocs} session={session} mySeats={mySeats} />}
      {sec === "vote" && <Vote unit={vote} session={session} />}
      {sec === "history" && <History session={session} />}
      {sec === "data" && <MyData session={session} />}
    </div>
  );
}
