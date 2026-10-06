import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Tabbed from "../components/Tabbed";
import { PageTitle } from "../components/ui";
import { introSeen, markIntroSeen } from "../lib/crowdSession";
import { NewPasswordForm } from "./guess/Account";
import Dashboard from "./guess/Dashboard";
import Mine from "./guess/Mine";
import { LOCK_AT } from "./guess/model";
import { Btn, Notice } from "./guess/ui";
import { useSession } from "./guess/useCrowd";

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

export default function Guess() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [intro, setIntro] = useState(() => !introSeen());
  const [fromLink, setFromLink] = useState(false);

  // קישור אישי (?t=) — נקלט ונמחק מהכתובת. הוא גם מסלול השחזור: מי ששכח סיסמה פותח אותו וקובע חדשה.
  useEffect(() => {
    const t = params.get("t");
    if (!t) return;
    const next = new URLSearchParams(params);
    next.delete("t");
    setParams(next, { replace: true });
    session.setToken(t, "link");
    setFromLink(true);
    setFlash({ ok: true, text: "נכנסתם עם הקישור האישי." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageTitle lead="בונים כנסת של 120 — בדרך שלכם. אחר כך רואים מה ניחשו כל השאר, ומשווים לסקרים.">ההשערה שלך</PageTitle>
      <div className="mb-5">
        <Countdown />
      </div>
      {intro && (
        <div className="bg-paper-card border-2 border-ink rounded-theme p-4 mb-5">
          <h2 className="font-display text-3xl leading-none mb-2">השערות גולשים, אינן סקר</h2>
          <p className="text-sm leading-relaxed mb-3">
            כאן כל אחד מנחש כמה מנדטים תקבל כל רשימה. מי שמשתתף בוחר בזה בעצמו — אין דגימה ואין שקלול, ולכן הממוצע מספר מה חושבים הגולשים באתר, לא מה
            יקרה. ההשערה שלכם פרטית; רק ממוצע אנונימי מתפרסם.
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
      {fromLink && session.viaLink && session.me?.username && (
        <section className="bg-paper-card border-2 border-ink rounded-theme p-4 mb-5 space-y-2" aria-labelledby="link-pw-title">
          <h2 id="link-pw-title" className="font-display text-3xl leading-none">
            שכחתם את הסיסמה?
          </h2>
          <p className="text-sm">
            נכנסתם בשם <bdi className="font-bold">{session.me.username}</bdi> דרך הקישור האישי, ולכן אפשר לקבוע סיסמה חדשה בלי הישנה.
          </p>
          <NewPasswordForm session={session} onDone={() => (setFromLink(false), setFlash({ ok: true, text: "הסיסמה החדשה נקבעה. שאר המכשירים נותקו; הקישור האישי ממשיך לעבוד." }))} />
          <Btn onClick={() => setFromLink(false)}>לא צריך, תודה</Btn>
        </section>
      )}
      <Tabbed
        label="ההשערה שלך"
        tabs={[
          { id: "mine", label: "שלי", element: <Mine session={session} /> },
          { id: "dashboard", label: "דשבורד", element: <Dashboard session={session} /> },
        ]}
      />
    </>
  );
}
