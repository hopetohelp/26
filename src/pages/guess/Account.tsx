import { useState, type FormEvent } from "react";
import { call } from "../../lib/crowdApi";
import LinkSaver, { FORGOT_LINE } from "./LinkSaver";
import { Btn, Field, inputCls } from "./ui";
import { errorText, type useSession } from "./useCrowd";

const PW_MIN = 10;
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

/**
 * קביעת סיסמה חדשה. עם הקישור האישי — בלי הסיסמה הנוכחית (זה מסלול השחזור); עם סשן רגיל — חובה.
 * בשני המקרים השרת מנתק את שאר המכשירים; הקישור עצמו ממשיך לעבוד.
 */
export function NewPasswordForm({ session, onDone }: { session: ReturnType<typeof useSession>; onDone?: () => void }) {
  const { token, viaLink } = session;
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const a = useAction();
  return (
    <form
      className="space-y-2"
      onSubmit={a.run(async () => {
        const r = await call<{ token: string }>("/auth/password", { token, body: viaLink ? { next } : { current: cur, next } });
        session.setToken(r.token, "keep");
        setCur("");
        setNext("");
        onDone?.();
        return "הסיסמה נקבעה. שאר המכשירים נותקו; הקישור האישי ממשיך לעבוד.";
      })}
    >
      <div className="grid sm:grid-cols-3 gap-2 items-end">
        {!viaLink && (
          <Field label="סיסמה נוכחית">
            <input {...pwProps} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
        )}
        <Field label="סיסמה חדשה" hint={`לפחות ${PW_MIN} תווים`}>
          <input {...pwProps} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Btn type="submit" kind={viaLink ? "primary" : "ghost"} disabled={a.busy}>
          {viaLink ? "קביעת סיסמה חדשה" : "החלפת סיסמה"}
        </Btn>
      </div>
      {viaLink && <p className="text-xs text-ink-soft">נכנסתם עם הקישור האישי, ולכן אין צורך בסיסמה הקודמת.</p>}
      {a.view}
    </form>
  );
}

/** שם משתמש וסיסמה (רשות). אין מייל — השחזור הוא הקישור האישי */
export default function Account({ session }: { session: ReturnType<typeof useSession> }) {
  const { me, token, link } = session;
  const [mode, setMode] = useState<"login" | "register">(token ? "register" : "login");
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [justRegistered, setJustRegistered] = useState(false);
  const a = useAction();

  if (me?.username) {
    return (
      <section className="space-y-3">
        <h3 className="font-display text-3xl leading-none">החשבון</h3>
        <p className="text-sm">
          מחוברים בשם <bdi className="font-bold">{me.username}</bdi>.
        </p>
        {justRegistered && link && (
          <div className="border-2 border-ink rounded-theme p-3 space-y-2 bg-paper">
            <p className="text-sm font-bold">עכשיו שמרו את הקישור האישי — הוא הדרך היחידה לשחזר סיסמה שנשכחה.</p>
            <LinkSaver token={link} />
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: {} }), session.setToken(null), "התנתקתם מהמכשיר הזה."))}>התנתקות</Btn>
          <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: { all: true } }), session.setToken(null), "התנתקתם מכל המכשירים."))}>התנתקות מכל המכשירים</Btn>
        </div>
        {a.view}
        <h4 className="font-bold">{session.viaLink ? "קביעת סיסמה חדשה" : "החלפת סיסמה"}</h4>
        <NewPasswordForm session={session} />
        <p className="text-sm bg-accent-soft text-ink rounded-theme px-3 py-2">{FORGOT_LINE} אין שחזור במייל — האתר לא שומר מייל בכלל.</p>
      </section>
    );
  }

  const tabs = [
    ["login", "כניסה"],
    ["register", token ? "הוספת שם משתמש" : "הרשמה"],
  ] as const;
  return (
    <section className="space-y-3">
      <h3 className="font-display text-3xl leading-none">שם משתמש וסיסמה</h3>
      <p className="text-sm text-ink-soft">רשות. מאפשר להיכנס מכל מכשיר גם בלי הקישור האישי. בלי שם אמיתי ובלי מייל.</p>
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="פעולה">
        {tabs.map(([m, l]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`min-h-[44px] px-3 rounded-full border-2 text-sm font-bold ${mode === m ? "bg-ink text-paper-card border-ink" : "bg-paper-card border-paper-line"}`}>
            {l}
          </button>
        ))}
      </div>
      <form
        className="grid sm:grid-cols-3 gap-2 items-end"
        onSubmit={a.run(async () => {
          const r = await call<{ token: string }>(`/auth/${mode}`, { token: mode === "register" ? token : null, body: { username: u, password: pw } });
          setPw("");
          if (mode === "login") {
            session.setToken(r.token);
            return "נכנסתם. ההשערות שלכם נטענו.";
          }
          // הרשמה: אותו משתתף, סשן חדש — הקישור האישי נשאר ומוצג מיד לשמירה
          session.setToken(r.token, "keep");
          setJustRegistered(true);
          return "נרשמתם. מעכשיו אפשר להיכנס מכל מכשיר.";
        })}
      >
        <Field label="שם משתמש">
          <input required minLength={3} maxLength={40} autoComplete="username" dir="ltr" className={inputCls} value={u} onChange={(e) => setU(e.target.value)} />
        </Field>
        <Field label="סיסמה" hint={mode === "register" ? `לפחות ${PW_MIN} תווים` : undefined}>
          <input {...pwProps} autoComplete={mode === "login" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Btn type="submit" kind="primary" disabled={a.busy}>
          {mode === "login" ? "כניסה" : "הרשמה"}
        </Btn>
      </form>
      <p className="text-sm bg-accent-soft text-ink rounded-theme px-3 py-2">{FORGOT_LINE}</p>
      {mode === "login" && token && <p className="text-xs text-ink-soft">כניסה לחשבון אחר מחליפה את מה שמחובר בדפדפן הזה. כדאי לשמור קודם את הקישור האישי.</p>}
      {a.view}
    </section>
  );
}
