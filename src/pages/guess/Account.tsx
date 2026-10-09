import { useState, type FormEvent } from "react";
import { call, CrowdError } from "../../lib/crowdApi";
import { hasConsent, setConsent } from "../../lib/crowdSession";
import { FORGOT_LINE } from "./LinkSaver";
import { Btn, Field, inputCls } from "./ui";
import { errorText, type useSession } from "./useCrowd";

import ErrorReport from "../../components/ErrorReport";
import GoogleButton from "./GoogleButton";

const PW_MIN = 6;
const PW_MAX = 128;
const pwProps = { type: "password", minLength: PW_MIN, maxLength: PW_MAX, required: true, className: inputCls, dir: "ltr" as const };

/** שדה סיסמה עם "הצגה": מקטין טעויות הקלדה, במיוחד בטלפון */
function PasswordField({ label, hint, value, onChange, mode }: { label: string; hint?: string; value: string; onChange: (v: string) => void; mode: "current" | "new" }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <span className="flex gap-2">
        <input {...pwProps} type={show ? "text" : "password"} autoComplete={mode === "current" ? "current-password" : "new-password"} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow((x) => !x)} aria-pressed={show} className="shrink-0 min-h-[44px] px-3 rounded-theme border border-paper-line text-sm font-bold">
          {show ? "הסתרה" : "הצגה"}
        </button>
      </span>
    </Field>
  );
}

function useAction(action: string) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string; log?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<string>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err), log: JSON.stringify({ action, ...(err instanceof CrowdError ? { code: err.code, status: err.status, ...err.diagnostic } : { code: "unexpected" }) }, null, 2) });
    } finally {
      setBusy(false);
    }
  };
  const view = msg && (msg.ok ? <p role="status" className="text-sm font-bold">{msg.text}</p> : <ErrorReport error={msg.text} errorLog={msg.log} />);
  return { run, busy, view };
}

/** החלפת סיסמה בסשן רגיל — חובה הסיסמה הנוכחית. השרת מנתק את שאר המכשירים; הקישור האישי נשאר. */
export function NewPasswordForm({ session, onDone }: { session: ReturnType<typeof useSession>; onDone?: () => void }) {
  const { token } = session;
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const a = useAction("החלפת סיסמה");
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
      <div className="grid sm:grid-cols-2 gap-3 items-start [&>*]:min-w-0">
        <Field label="סיסמה נוכחית">
          <input {...pwProps} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="סיסמה חדשה" hint={`לפחות ${PW_MIN} תווים`}>
          <input {...pwProps} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Btn type="submit" disabled={a.busy} className="sm:col-span-2 w-full mt-1">
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
  const a = useAction("שחזור חשבון");
  return (
    <form
      className="space-y-2"
      onSubmit={a.run(async () => {
        const r = await call<{ token: string; username: string | null; email: string | null }>("/auth/recover", { body: { link, password: pw } });
        setPw("");
        session.setToken(r.token);
        onDone(r.email ?? r.username ?? "");
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

/** מה נשמר ומי רואה — מקופל, כדי שהטופס יישאר קצר */
function PrivacyNote() {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-bold min-h-[44px] flex items-center">מה נשמר ומי רואה?</summary>
      <ul className="list-disc ps-5 space-y-1 pb-2">
        <li>המייל והשם נשמרים בשרת האתר <strong>מוצפנים</strong>, מוצגים רק לכם, ומשמשים רק לזיהוי ולמניעת חשבון כפול. לא נשלחים אליהם מיילים.</li>
        <li>מ-Google נשמרים רק מזהה פנימי והמייל (מוצפן). תמונת הפרופיל נשמרת רק בדפדפן הזה.</li>
        <li>הגרסה האחרונה שלכם נכנסת לממוצע הגולשים, בלי שום פרט מזהה. גם צוות האתר רואה את ההשערות בלי שם ובלי מייל.</li>
        <li>אם החיבור לשרת נכשל, נשלח אלינו דיווח אוטומטי עם פרטים טכניים בלבד, בלי סיסמה, מייל או ההשערה.</li>
        <li>אפשר למחוק הכול בכל רגע באזור האישי.</li>
      </ul>
    </details>
  );
}

/**
 * הרשמה או כניסה (הכרעת בעלים 9.10.2026): Google, או מייל + סיסמה. חשבון אחד לכל מייל.
 * בלי חשבון — הכול נשמר רק בדפדפן ולא נכנס לסטטיסטיקות; בהרשמה זה עולה לחשבון (syncLocal).
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
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(hasConsent);
  const a = useAction(mode === "register" ? "הרשמה" : "כניסה");
  const register = mode === "register";
  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2 text-sm font-bold">
        <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        הבנתי: הגרסה האחרונה שלי נכנסת לממוצע האנונימי של הגולשים, ואפשר למחוק הכול בכל רגע.
      </label>
      <section className="space-y-2" aria-label="כניסה עם Google">
        <GoogleButton session={session} onDone={onDone} disabled={!agree} />
        {!agree && <p className="text-xs text-ink">הכפתור יופיע אחרי סימון "הבנתי".</p>}
      </section>
      <form
        className="space-y-3 border-t border-paper-line pt-3"
        onSubmit={a.run(async () => {
          const r = await call<{ token: string; link?: string }>(`/auth/${mode}`, { body: register ? { email, password: pw, ...(name.trim() ? { name } : {}) } : { email, password: pw } });
          setPw("");
          setConsent(true);
          session.setToken(r.token);
          if (r.link) session.setLink(r.link);
          onDone?.(r.token);
          return register ? "נרשמתם." : "נכנסתם.";
        })}
      >
        <h3 className="font-bold">{register ? "או: הרשמה במייל" : "כניסה במייל"}</h3>
        <div className="grid sm:grid-cols-2 gap-3 items-start [&>*]:min-w-0">
          <Field label={register ? "מייל" : "מייל (או שם משתמש ישן)"}>
            <input required type={register ? "email" : "text"} maxLength={254} autoComplete={register ? "email" : "username"} dir="ltr" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <PasswordField label="סיסמה" hint={register ? `לפחות ${PW_MIN} תווים` : undefined} value={pw} onChange={setPw} mode={register ? "new" : "current"} />
          {register && (
            <Field label="שם (רשות)" hint="מוצג רק לכם">
              <input maxLength={40} autoComplete="nickname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Btn type="submit" kind="primary" disabled={a.busy || (register && !agree)}>
            {(register ? "הרשמה" : "כניסה") + submitSuffix}
          </Btn>
          <button type="button" onClick={() => setMode(register ? "login" : "register")} className="min-h-[44px] px-2 text-sm font-bold underline underline-offset-2">
            {register ? "כבר יש לי חשבון" : "אין לי חשבון — הרשמה"}
          </button>
        </div>
        {!register && <p className="text-xs text-ink">{FORGOT_LINE}</p>}
        {a.view}
      </form>
      <PrivacyNote />
    </div>
  );
}

/** חשבון ישן בלי מייל ובלי Google (הכרעת בעלים 9.10.2026: נדרש בכניסה הבאה): הוספת מייל, וסיסמה אם אין עדיין */
export function ClaimForm({ session, onDone }: { session: ReturnType<typeof useSession>; onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const needsPassword = !session.me?.hasPassword && !session.me?.google;
  const a = useAction("הוספת מייל");
  return (
    <form
      className="space-y-3"
      onSubmit={a.run(async () => {
        const r = await call<{ email: string; link?: string }>("/auth/claim", { token: session.token, body: { email, ...(needsPassword ? { password: pw } : {}) } });
        setPw("");
        if (r.link) session.setLink(r.link);
        await session.refresh();
        onDone?.();
        return r.link ? "המייל נוסף. שמרו עכשיו את הקישור האישי." : "המייל נוסף.";
      })}
    >
      <div className="grid sm:grid-cols-2 gap-3 items-start [&>*]:min-w-0">
        <Field label="מייל" hint="נשמר מוצפן ומוצג רק לכם">
          <input required type="email" maxLength={254} autoComplete="email" dir="ltr" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {needsPassword && <PasswordField label="סיסמה" hint={`לפחות ${PW_MIN} תווים`} value={pw} onChange={setPw} mode="new" />}
      </div>
      <Btn type="submit" kind="primary" disabled={a.busy}>
        הוספת מייל
      </Btn>
      {a.view}
    </form>
  );
}

/** שם תצוגה (רשות) — מוצפן בשרת, מוצג רק לבעל החשבון */
export function NameForm({ session }: { session: ReturnType<typeof useSession> }) {
  const [name, setName] = useState(session.me?.name ?? "");
  const a = useAction("שינוי שם");
  return (
    <form
      className="flex gap-2 items-end flex-wrap"
      onSubmit={a.run(async () => {
        await call("/account/name", { token: session.token, body: { name } });
        await session.refresh();
        return name.trim() ? "השם נשמר." : "השם נמחק.";
      })}
    >
      <Field label="שם (רשות)" hint="מוצג רק לכם">
        <input maxLength={40} autoComplete="nickname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Btn type="submit" disabled={a.busy}>שמירה</Btn>
      {a.view}
    </form>
  );
}

/** קביעת סיסמה לחשבון בלי סיסמה (למשל Google בלבד) — כדי להיכנס גם במייל */
function SetPasswordForm({ session }: { session: ReturnType<typeof useSession> }) {
  const [pw, setPw] = useState("");
  const a = useAction("קביעת סיסמה");
  return (
    <form
      className="space-y-2"
      onSubmit={a.run(async () => {
        await call("/account/password", { token: session.token, body: { password: pw } });
        setPw("");
        await session.refresh();
        return "הסיסמה נקבעה. אפשר להיכנס גם במייל.";
      })}
    >
      <PasswordField label="סיסמה חדשה" hint={`לפחות ${PW_MIN} תווים`} value={pw} onChange={setPw} mode="new" />
      <Btn type="submit" disabled={a.busy}>קביעת סיסמה</Btn>
      {a.view}
    </form>
  );
}

const mask = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, d: string) => a + "•".repeat(Math.min(6, b.length)) + d);

/** "הפרטים שלי" באזור האישי: Google, מייל, שם, סיסמה, יציאה. בלי חשבון ⇐ הרשמה או כניסה */
export default function Account({ session }: { session: ReturnType<typeof useSession> }) {
  const { me, token } = session;
  const [showEmail, setShowEmail] = useState(false);
  const a = useAction("התנתקות");
  if (!token) return <AuthForm session={session} />;
  if (!me) return <p className="text-ink-soft">טוען…</p>;
  const emails = (me.emails ?? []).filter((e) => e.email);
  const row = "py-3 border-b border-paper-line space-y-2";
  return (
    <div className="space-y-1">
      {me.needsEmail && (
        <div className="border-2 border-warn rounded-theme p-3 space-y-3 mb-3">
          <p className="font-bold">חסר מייל או Google בחשבון.</p>
          <p className="text-sm">כל חשבון צריך מייל או Google. ההשערה שלכם נשמרת ונספרת גם בינתיים.</p>
          <GoogleButton session={session} onDone={() => void session.refresh()} />
          <ClaimForm session={session} />
        </div>
      )}
      <div className={row}>
        <p className="font-bold">Google</p>
        {me.google ? <p className="text-sm">מחובר.</p> : <><p className="text-sm text-ink-soft">לא מחובר. חיבור מאפשר להיכנס בלחיצה אחת.</p><GoogleButton session={session} onDone={() => void session.refresh()} /></>}
      </div>
      <div className={row}>
        <p className="font-bold">מייל</p>
        {emails.length ? (
          <ul className="text-sm space-y-1">
            {emails.map((e) => (
              <li key={e.email}>
                <span dir="ltr">{showEmail ? e.email : mask(e.email!)}</span>
                {e.verified && <span className="block text-xs text-ink-soft">אומת ב-Google</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-soft">אין עדיין.</p>}
        {!!emails.length && <button type="button" onClick={() => setShowEmail((x) => !x)} className="text-sm underline min-h-[44px]">{showEmail ? "הסתרה" : "הצגה מלאה"}</button>}
      </div>
      <div className={row}>
        <NameForm session={session} />
      </div>
      <div className={row}>
        <p className="font-bold">סיסמה</p>
        {me.hasPassword ? <NewPasswordForm session={session} /> : emails.length ? <SetPasswordForm session={session} /> : <p className="text-sm text-ink-soft">אפשר לקבוע סיסמה אחרי הוספת מייל.</p>}
      </div>
      <div className="pt-3 grid sm:grid-cols-2 gap-3 [&>*]:min-w-0">
        <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: {} }), session.setToken(null), "התנתקתם מהמכשיר הזה."))}>התנתקות</Btn>
        <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: { all: true } }), session.setToken(null), "התנתקתם מכל המכשירים."))}>התנתקות מכל המכשירים</Btn>
      </div>
      {a.view}
    </div>
  );
}
