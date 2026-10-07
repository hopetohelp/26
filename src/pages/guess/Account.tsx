import { useState, type FormEvent } from "react";
import { call } from "../../lib/crowdApi";
import { hasConsent, setConsent } from "../../lib/crowdSession";
import { FORGOT_LINE } from "./LinkSaver";
import { Btn, Field, inputCls } from "./ui";
import { errorText, type useSession } from "./useCrowd";

const PW_MIN = 6;
const PW_MAX = 128;
const pwProps = { type: "password", minLength: PW_MIN, maxLength: PW_MAX, required: true, className: inputCls, dir: "ltr" as const };

function useAction() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<string>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  const view = msg && (
    <p role={msg.ok ? "status" : "alert"} className={`text-sm font-bold ${msg.ok ? "" : "text-warn"}`}>
      {msg.text}
    </p>
  );
  return { run, busy, view };
}

/** החלפת סיסמה בסשן רגיל — חובה הסיסמה הנוכחית. השרת מנתק את שאר המכשירים; הקישור האישי נשאר. */
export function NewPasswordForm({ session, onDone }: { session: ReturnType<typeof useSession>; onDone?: () => void }) {
  const { token } = session;
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const a = useAction();
  return (
    <form
      className="space-y-2"
      onSubmit={a.run(async () => {
        const r = await call<{ token: string }>("/auth/password", { token, body: { current: cur, next } });
        session.setToken(r.token, true);
        setCur("");
        setNext("");
        onDone?.();
        return "הסיסמה הוחלפה. שאר המכשירים נותקו.";
      })}
    >
      <div className="grid sm:grid-cols-3 gap-2 items-end">
        <Field label="סיסמה נוכחית">
          <input {...pwProps} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="סיסמה חדשה" hint={`לפחות ${PW_MIN} תווים`}>
          <input {...pwProps} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Btn type="submit" disabled={a.busy}>
          החלפת סיסמה
        </Btn>
      </div>
      {a.view}
    </form>
  );
}

/**
 * שחזור: מי שנכנס בקישור האישי (?t=) יכול לקבוע כאן סיסמה חדשה בלי הישנה (POST /auth/recover).
 */
export function RecoverForm({ link, session, onDone }: { link: string; session: ReturnType<typeof useSession>; onDone: (username: string) => void }) {
  const [pw, setPw] = useState("");
  const a = useAction();
  return (
    <form
      className="space-y-2"
      onSubmit={a.run(async () => {
        const r = await call<{ token: string; username: string }>("/auth/recover", { body: { link, password: pw } });
        setPw("");
        session.setToken(r.token);
        onDone(r.username);
        return "הסיסמה החדשה נקבעה.";
      })}
    >
      <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="סיסמה חדשה" hint={`לפחות ${PW_MIN} תווים. שאר המכשירים ינותקו.`}>
          <input {...pwProps} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Btn type="submit" kind="primary" disabled={a.busy}>
          קביעת סיסמה חדשה
        </Btn>
      </div>
      {a.view}
    </form>
  );
}

/**
 * הרשמה או כניסה — שם משתמש וסיסמה. זו הדרך היחידה לשמור (הכרעת בעלים 6.10.2026).
 * בהרשמה נוצר גם קישור אישי (כניסה ישירה + שחזור סיסמה), והוא מוצג מיד לשמירה. ההסכמה נדרשת לפני השמירה הראשונה.
 */
export function AuthForm({
  session,
  onDone,
  initial = "register",
  submitSuffix = "",
}: {
  session: ReturnType<typeof useSession>;
  onDone?: (token: string) => void;
  initial?: "login" | "register";
  submitSuffix?: string;
}) {
  const [mode, setMode] = useState<"login" | "register">(initial);
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(hasConsent);
  const a = useAction();
  const tabs = [
    ["register", "הרשמה"],
    ["login", "כבר יש לי חשבון"],
  ] as const;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="פעולה">
        {tabs.map(([m, l]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`min-h-[44px] px-3 rounded-full border-2 text-sm font-bold ${mode === m ? "bg-ink text-paper-card border-ink" : "bg-paper-card border-paper-line"}`}>
            {l}
          </button>
        ))}
      </div>
      <form
        className="space-y-3"
        onSubmit={a.run(async () => {
          const r = await call<{ token: string; link?: string }>(`/auth/${mode}`, { body: { username: u, password: pw } });
          setPw("");
          setConsent(true);
          session.setToken(r.token);
          if (r.link) session.setLink(r.link);
          onDone?.(r.token);
          return mode === "login" ? "נכנסתם." : "נרשמתם.";
        })}
      >
        <div className="grid sm:grid-cols-2 gap-2">
          <Field label="שם משתמש" hint={mode === "register" ? "3–24 אותיות או ספרות. לא שם אמיתי." : undefined}>
            <input required minLength={3} maxLength={24} autoComplete="username" dir="ltr" className={inputCls} value={u} onChange={(e) => setU(e.target.value)} />
          </Field>
          <Field label="סיסמה" hint={mode === "register" ? `לפחות ${PW_MIN} תווים` : undefined}>
            <input {...pwProps} autoComplete={mode === "login" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        </div>
        {mode === "register" && (
          <>
            <ul className="list-disc ps-5 text-sm space-y-1">
              <li>מה שתשמרו נשמר בשרת האתר תחת שם המשתמש שבחרתם — בלי שם אמיתי ובלי מייל.</li>
              <li>הגרסה האחרונה שלכם נכנסת לממוצע הגולשים, בלי שום פרט מזהה. הנתונים מוצגים גם עבור משתתף יחיד; בקבוצות קטנות אפשר להסיק תשובות ללא שם. מספר משתתפים קטן אינו משקף את הציבור.</li>
              <li>אף אחד אחר לא רואה את ההשערה האישית שלכם. אפשר למחוק הכול בכל רגע ב"הנתונים שלי".</li>
            </ul>
            <label className="flex items-start gap-2 text-sm font-bold">
              <input type="checkbox" className="mt-1 w-5 h-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
              הבנתי, ואני מסכים/ה
            </label>
          </>
        )}
        <Btn type="submit" kind="primary" disabled={a.busy || (mode === "register" && !agree)}>
          {(mode === "login" ? "כניסה" : "הרשמה") + submitSuffix}
        </Btn>
      </form>
      <p className="text-xs text-ink-soft">{FORGOT_LINE}</p>
      {a.view}
    </div>
  );
}

/** החשבון: מחוברים ⇐ יציאה והחלפת סיסמה · לא מחוברים ⇐ הרשמה או כניסה */
export default function Account({ session }: { session: ReturnType<typeof useSession> }) {
  const { me, token } = session;
  const a = useAction();

  if (token && me?.username) {
    return (
      <section className="space-y-3">
        <h3 className="font-display text-3xl leading-none">החשבון</h3>
        <p className="text-sm">
          מחוברים בשם <bdi className="font-bold">{me.username}</bdi>.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: {} }), session.setToken(null), "התנתקתם מהמכשיר הזה."))}>התנתקות</Btn>
          <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: { all: true } }), session.setToken(null), "התנתקתם מכל המכשירים."))}>התנתקות מכל המכשירים</Btn>
        </div>
        {a.view}
        <h4 className="font-bold">החלפת סיסמה</h4>
        <NewPasswordForm session={session} />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="font-display text-3xl leading-none">חשבון</h3>
      <p className="text-sm text-ink-soft">כדי לשמור צריך שם משתמש וסיסמה — בלי שם אמיתי ובלי מייל. עד אז הטיוטות נשמרות רק בדפדפן הזה.</p>
      <AuthForm session={session} />
    </section>
  );
}
