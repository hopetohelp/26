import { useState, type FormEvent } from "react";
import { call } from "../../lib/crowdApi";
import { Btn, Field, inputCls, Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

const PW_MIN = 8;
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

/** שם משתמש וסיסמה (רשות) + מייל לשחזור (רשות, מאומת) */
export default function Account({ session }: { session: ReturnType<typeof useSession> }) {
  const { me, token } = session;
  const [mode, setMode] = useState<"login" | "register" | "forgot">(token ? "register" : "login");
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [email, setEmail] = useState("");
  const a = useAction();

  if (me?.username) {
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
        <form className="grid sm:grid-cols-3 gap-2 items-end" onSubmit={a.run(async () => {
          const r = await call<{ token: string }>("/auth/password", { token, body: { current: pw, next: pw2 } });
          session.setToken(r.token);
          setPw("");
          setPw2("");
          return "הסיסמה הוחלפה. שאר המכשירים נותקו.";
        })}>
          <Field label="סיסמה נוכחית"><input {...pwProps} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="סיסמה חדשה"><input {...pwProps} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          <Btn type="submit" disabled={a.busy}>החלפת סיסמה</Btn>
        </form>
        <div className="space-y-2">
          <h4 className="font-bold">מייל לשחזור</h4>
          {me.hasEmail ? (
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm">יש מייל מאומת לשחזור (שמור מוצפן).</span>
              <Btn onClick={a.run(async () => (await call("/auth/email", { token, body: { email: null } }), await session.refresh(), "המייל הוסר."))}>הסרת המייל</Btn>
            </div>
          ) : (
            <form className="flex gap-2 items-end flex-wrap" onSubmit={a.run(async () => (await call("/auth/email", { token, body: { email } }), setEmail(""), "שלחנו קישור אימות — המייל יפעל אחרי האישור."))}>
              <Field label="מייל (רשות)" hint="משמש רק לאיפוס סיסמה. נשמר מוצפן.">
                <input type="email" required dir="ltr" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Btn type="submit" disabled={a.busy}>הוספה</Btn>
            </form>
          )}
        </div>
        {a.view}
      </section>
    );
  }

  const tabs = [
    ["login", "כניסה"],
    ["register", token ? "הוספת שם משתמש" : "הרשמה"],
    ["forgot", "שכחתי סיסמה"],
  ] as const;
  return (
    <section className="space-y-3">
      <h3 className="font-display text-3xl leading-none">שם משתמש וסיסמה</h3>
      <p className="text-sm text-ink-soft">רשות. מאפשר להיכנס מכל מכשיר גם בלי הקישור האישי. בלי שם אמיתי ובלי מייל חובה.</p>
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
          if (mode === "forgot") {
            await call("/auth/forgot", { body: { username: u } });
            return "אם לשם המשתמש הזה יש מייל מאומת, נשלח אליו קישור איפוס לחצי שעה.";
          }
          const r = await call<{ token: string }>(`/auth/${mode}`, { token: mode === "register" ? token : null, body: { username: u, password: pw } });
          session.setToken(r.token);
          setPw("");
          return mode === "login" ? "נכנסתם. ההשערות שלכם נטענו." : "נרשמתם. מעכשיו אפשר להיכנס מכל מכשיר.";
        })}
      >
        <Field label="שם משתמש">
          <input required minLength={3} maxLength={40} autoComplete="username" dir="ltr" className={inputCls} value={u} onChange={(e) => setU(e.target.value)} />
        </Field>
        {mode !== "forgot" && (
          <Field label="סיסמה" hint={mode === "register" ? `לפחות ${PW_MIN} תווים` : undefined}>
            <input {...pwProps} autoComplete={mode === "login" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        )}
        <Btn type="submit" kind="primary" disabled={a.busy}>
          {mode === "login" ? "כניסה" : mode === "register" ? "הרשמה" : "שליחת קישור"}
        </Btn>
      </form>
      {mode === "login" && token && <p className="text-xs text-ink-soft">כניסה לחשבון אחר מחליפה את מה שמחובר בדפדפן הזה. כדאי להעתיק קודם את הקישור האישי.</p>}
      {a.view}
    </section>
  );
}

/** איפוס סיסמה מקישור במייל (?reset=) */
export function ResetPanel({ reset, session, onDone }: { reset: string; session: ReturnType<typeof useSession>; onDone: (msg: string) => void }) {
  const [pw, setPw] = useState("");
  const a = useAction();
  if (!session.online) return <Notice>איפוס הסיסמה עוד לא פעיל באתר.</Notice>;
  return (
    <form
      className="bg-paper-card border-2 border-ink rounded-theme p-4 mb-5 space-y-2"
      onSubmit={a.run(async () => {
        const r = await call<{ token: string }>("/auth/reset", { body: { reset, password: pw } });
        session.setToken(r.token);
        onDone("הסיסמה הוחלפה ונכנסתם.");
        return "";
      })}
    >
      <h2 className="font-display text-3xl leading-none">סיסמה חדשה</h2>
      <Field label="סיסמה חדשה" hint={`לפחות ${PW_MIN} תווים. הקישור תקף לחצי שעה ולשימוש אחד.`}>
        <input {...pwProps} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Btn type="submit" kind="primary" disabled={a.busy}>שמירת הסיסמה</Btn>
      {a.view}
    </form>
  );
}
