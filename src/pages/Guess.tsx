import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Split } from "../components/ui";
import type { SeatCell, SeatsPayload } from "../lib/crowdApi";
import { call } from "../lib/crowdApi";
import { maskIdentifier } from "../lib/identifier";
import { absorbFeedbackToken } from "../lib/feedback";
import { introSeen, loadDraft, markIntroSeen, saveDraft } from "../lib/crowdSession";
import { decodeGuess } from "../lib/shareGuess";
import { RecoverForm } from "./guess/Account";
import Dashboard from "./guess/Dashboard";
import Mine from "./guess/Mine";
import { IDS, LOCK_AT } from "./guess/model";
import SharedGuess from "./guess/SharedGuess";
import { Btn, Notice } from "./guess/ui";
import { errorText, useSession } from "./guess/useCrowd";

/** ספירה לאחור לנעילת ההשערות לתחרות הדיוק (26.10.2026, 23:59 שעון ישראל) */
function Countdown() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const ms = LOCK_AT - now;
  if (ms <= 0) return <p className="text-sm font-bold">ההשערות לתחרות הדיוק ננעלו. אחרי הבחירות נראה של מי הייתה הכי קרובה.</p>;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return (
    <p className="flex items-baseline gap-2 flex-wrap text-sm">
      <span className="font-num tabular text-3xl leading-none">{d}</span> ימים
      <span className="font-num tabular text-3xl leading-none">{h}</span> שעות
      <span className="text-ink-soft">עד שההשערות ננעלות לתחרות הדיוק (26.10, 23:59)</span>
    </p>
  );
}

export default function Guess({ community = false }: { community?: boolean }) {
  const navigate = useNavigate();
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [intro, setIntro] = useState(() => !introSeen());
  const [recoverLink, setRecoverLink] = useState<string | null>(null);
  const [mineKey, setMineKey] = useState(0);
  const view = community ? "statistics" : "mine";
  const setView = (value: "mine" | "statistics") => { if (value !== view) navigate(value === "statistics" ? "/community" : "/guess"); };
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

  // השערה ששותפה (?g=) — מפוענחת בזהירות; קישור פגום פשוט לא מציג כלום
  const gRaw = params.get("g");
  const shared = useMemo(() => decodeGuess(gRaw, IDS), [gRaw]);
  const closeShared = () => {
    const next = new URLSearchParams(params);
    next.delete("g");
    next.delete("tab");
    setParams(next, { replace: true });
  };
  const startFromShared = (fromThis: boolean) => {
    if (fromThis && shared) {
      const seats: Record<string, SeatCell> = Object.fromEntries(IDS.map((id) => [id, { v: shared.seats[id] ?? 0, src: "manual", locked: true }]));
      const p: SeatsPayload = shared.pct ? { mode: "pct", pct: shared.pct, seats, start: "zero", pollsAsOf: null } : { mode: "seats", seats, start: "zero", pollsAsOf: null };
      saveDraft("seats", p);
      setMineKey((k) => k + 1);
    }
    closeShared();
    if (community) navigate("/guess");
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };


  return (
    <>
      {/* ההשערה שלי: הפתיחה והבחירה בטור הצר, ההשערה או הסטטיסטיקות ברחב */}
      {(() => { const head = <>
      {shared && <SharedGuess g={shared} hasDraft={!!loadDraft("seats")} onStart={startFromShared} onClose={closeShared} />}
      {!community && <div className="mb-5"><Countdown /></div>}
      {intro && !shared && !community && (
        <div className="bg-paper-card border-2 border-ink rounded-theme p-4 mb-5">
          <h2 className="text-xl font-display leading-tight mb-2">השערות גולשים, אינן סקר</h2>
          <p className="text-sm leading-relaxed mb-3">
            כאן כל אחד מנחש כמה מנדטים תקבל כל רשימה. מי שמשתתף בוחר בזה בעצמו — אין דגימה ואין שקלול, ולכן הממוצע מספר מה חושבים הגולשים באתר, לא מה
            יקרה. כדי שההשערה תיכנס לממוצע צריך חשבון — Google או מייל; בלי חשבון היא נשמרת רק במכשיר הזה. הנתונים מתפרסמים ללא שם, גם בקבוצות קטנות.
          </p>
          <Btn kind="primary" onClick={() => (markIntroSeen(), setIntro(false))}>
            הבנתי, בואו נתחיל
          </Btn>
        </div>
      )}
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
      {community && <div id="community-blocs" />}
      </>; const body = view === "mine" ? (
        <section id="my-guess" ref={top}>
          <Mine key={mineKey} session={session} onStatistics={() => setView("statistics")} />
        </section>
      ) : (
        <section id="statistics">
          <Dashboard session={session} />
        </section>
      ); return <Split title={community ? "סקר האתר" : "הכנסת שלי"} lead={community ? "ממוצע השערות המשתתפים, הגושים וההצבעה — והשוואה לסקרים ולהשערה שלכם. אפשר לצפות בלי חשבון." : "בונים כנסת של 120 — בדרך שלכם: בחלוקה ישירה או במחשבון המנדטים. אחר כך רואים מה ניחשו כל השאר, ומשווים לסקרים."} primary={head} secondary={body} />; })()}
    </>
  );
}
