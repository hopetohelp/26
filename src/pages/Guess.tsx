import GuessWorkspace from "./guess/Workspace";
import SaveButton from "./guess/SaveButton";
import { canViewCommunity } from "./guess/stage";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageTitle, Split } from "../components/ui";
import type { GroupPublic, SeatCell, SeatsPayload } from "../lib/crowdApi";
import { call } from "../lib/crowdApi";
import { maskIdentifier } from "../lib/identifier";
import { absorbFeedbackToken } from "../lib/feedback";
import { loadDraft } from "../lib/crowdSession";
import { decodeGuess } from "../lib/shareGuess";
import { RecoverForm } from "./guess/Account";
import Dashboard from "./guess/Dashboard";
import Mine from "./guess/Mine";
import { IDS } from "./guess/model";
import GuessIntro from "./guess/GuessIntro";
import SharedGuess from "./guess/SharedGuess";
import { Btn, Notice } from "./guess/ui";
import { errorText, useSession, useUnit } from "./guess/useCrowd";

/** landing = קבוצה שהגולש הגיע אליה בקישור שלה (#/g/…): סקר האתר נפתח עליה */
export default function Guess({ landing = null }: { landing?: GroupPublic | null }) {
  const navigate = useNavigate();
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [recoverLink, setRecoverLink] = useState<string | null>(null);
  const [mineKey, setMineKey] = useState(0);
  const seats = useUnit<SeatsPayload>("seats", null, session.me?.latest.seats?.payload as SeatsPayload | undefined);
  const complete = canViewCommunity(seats.draft, IDS);
  const previousComplete = useRef(complete);
  const gRaw = params.get("g");
  const shared = useMemo(() => decodeGuess(gRaw, IDS), [gRaw]);
  const sharedLink = !!shared;
  const statistics = complete && !sharedLink && params.get("view") !== "edit" && !params.has("section");
  const setStage = (stage: "edit" | "statistics") => {
    const next = new URLSearchParams(params);
    next.set("view", stage);
    next.delete("section");
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if (complete && !previousComplete.current && !sharedLink) setStage("statistics");
    previousComplete.current = complete;
  }, [complete, sharedLink]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = useRef<HTMLDivElement>(null);

  // קישור אישי ישן (?t=; אין הנפקה חדשה מ-10.10.2026, והוא נמחק כשהחשבון מאומת) — נקלט ונמחק מהכתובת, מכניס ישר (סשן רגיל דרך /auth/link) ומציע לקבוע סיסמה חדשה
  useEffect(() => {
    const t = params.get("t");
    if (!t) return;
    const next = new URLSearchParams(params);
    next.delete("t");
    next.delete("f");
    setParams(next, { replace: true });
    absorbFeedbackToken(params.get("f")); // שיחת ההערות שנושא הקישור
    call<{ token: string; username: string | null }>("/auth/link", { body: { link: t } })
      .then((r) => {
        session.setToken(r.token);
        setRecoverLink(t);
        setFlash({ ok: true, text: r.username ? `נכנסתם עם הקישור האישי, בשם ${maskIdentifier(r.username)}.` : "נכנסתם עם הקישור האישי." });
      })
      .catch((e) => setFlash({ ok: false, text: errorText(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // קישור פגום אינו חוסם את המעבר לממוצע המשתתפים.
  const closeShared = () => {
    const next = new URLSearchParams(params);
    next.delete("g");
    next.delete("tab");
    setParams(next, { replace: true });
  };
  const startFromShared = (fromThis: boolean) => {
    if (fromThis && shared) {
      const sharedSeats: Record<string, SeatCell> = Object.fromEntries(IDS.map((id) => [id, { v: shared.seats[id] ?? 0, src: "manual", locked: true }]));
      const p: SeatsPayload = shared.pct ? { mode: "pct", pct: shared.pct, seats: sharedSeats, start: "zero", pollsAsOf: null } : { mode: "seats", seats: sharedSeats, start: "zero", pollsAsOf: null };
      seats.setDraft(p);
      setMineKey((k) => k + 1);
    }
    closeShared();
    navigate("/guess?view=edit");
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };


  return (
    <>
      {/* ההשערה שלי: הפתיחה והבחירה בטור הצר, ההשערה או הסטטיסטיקות ברחב */}
      {(() => { const head = <>
      {shared && <SharedGuess g={shared} hasDraft={!!loadDraft("seats")} onStart={startFromShared} onClose={closeShared} />}
      {!statistics && !shared && <GuessIntro signedIn={!!session.token} />}
      {!statistics && <p className="c-stage-notice" role="status">{complete ? "הכנסת הושלמה. אפשר להמשיך לערוך או לצפות בממוצע המשתתפים." : "הצפייה בממוצע המשתתפים תיפתח אחרי השלמת הכנסת: 120 מנדטים, ולכל רשימה 0 או לפחות 4."}{complete && <Btn onClick={() => setStage("statistics")}>לממוצע המשתתפים ←</Btn>}</p>}
      {statistics && <div className="c-stage-heading"><PageTitle lead="שלב 2 · ההשערה שלכם מול הסקרים וממוצע המשתתפים. השערות המשתתפים אינן סקר.">הכנסת שלי — סקר האתר</PageTitle><div className="flex flex-wrap gap-2"><Btn onClick={() => setStage("edit")}>חזרה לעדכון ההשערה</Btn><SaveButton unit={seats} session={session} invalid={null} compact /></div></div>}
      {flash && (
        <div className="mb-4" role={flash.ok ? "status" : "alert"}>
          <Notice tone={flash.ok ? "calm" : "warn"}>{flash.text}</Notice>
        </div>
      )}
      {recoverLink && (
        <section className="bg-paper-card border-2 border-ink rounded-theme p-4 mb-5 space-y-2" aria-labelledby="recover-title">
          <h2 id="recover-title" className="text-xl font-display leading-tight">
            שכחתם את הסיסמה?
          </h2>
          <p className="text-sm">נכנסתם עם הקישור האישי, ולכן אפשר לקבוע סיסמה חדשה בלי הישנה. שאר המכשירים ינותקו, והקישור ימשיך לעבוד.</p>
          <RecoverForm
            link={recoverLink}
            session={session}
            onDone={() => (setRecoverLink(null), setFlash({ ok: true, text: "הסיסמה החדשה נקבעה. שאר המכשירים נותקו; הקישור האישי ממשיך לעבוד." }))}
          />
          <Btn onClick={() => setRecoverLink(null)}>לא צריך, תודה</Btn>
        </section>
      )}
      {statistics && <div id="community-share" />}
      </>; const body = !statistics ? (
        <section id="my-guess" ref={top}>
          <Mine key={mineKey} session={session} seats={seats} onStatistics={() => setStage("statistics")} />
        </section>
      ) : (
        <section id="statistics">
          <Dashboard session={session} landing={landing} mine={seats.draft} />
        </section>
      ); return <GuessWorkspace active={!statistics && !shared && (!params.has("section") || ["seats", "calculator"].includes(params.get("section")!))}><Split primary={head} secondary={body} /></GuessWorkspace>; })()}
    </>
  );
}
