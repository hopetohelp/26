import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { call, CrowdError, type GroupImportResult, type GroupLinkStats, type GroupStats as GroupStatsData } from "../../lib/crowdApi";
import GroupUpload from "../../components/GroupUpload";
import GroupStats from "../../components/GroupStats";
import { GroupAddEmail, GroupClearMembers, GroupImagePanel, GroupLinkPanel } from "../../components/GroupTools";
import { GroupManagerGuide } from "../../components/GroupGuide";
import { hasConsent, setConsent } from "../../lib/crowdSession";
import { clearResetSecret, getResetSecret } from "../../lib/resetPassword";
import { FORGOT_LINE } from "./LinkSaver";
import { Btn, Field, inputCls } from "./ui";
import { errorText, isUserError, type useSession } from "./useCrowd";

import ErrorReport from "../../components/ErrorReport";
import FilterBlocked, { useServerBlocked } from "../../components/FilterBlocked";
import GoogleButton from "./GoogleButton";

const PW_MIN = 6;
const PW_MAX = 128;
const pwProps = { type: "password", minLength: PW_MIN, maxLength: PW_MAX, required: true, className: inputCls, dir: "ltr" as const };

/** שדה סיסמה עם "הצגה": מקטין טעויות הקלדה, במיוחד בטלפון */
export function PasswordField({ label, hint, value, onChange, mode }: { label: string; hint?: string; value: string; onChange: (v: string) => void; mode: "current" | "new" }) {
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

/** explain = הסבר מיוחד לפעולה הזו (למשל סיסמה נוכחית שגויה בהחלפת סיסמה); בלי — errorText */
export function useAction(action: string, explain?: (e: unknown) => string | null) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string; log?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<string>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (err) {
      // טעות קלט או פרטי כניסה ⇐ רק הסבר; לוג וכפתור דיווח — רק לתקלה אמיתית (רשת, שרת)
      const log = isUserError(err) ? undefined : JSON.stringify({ action, ...(err instanceof CrowdError ? { code: err.code, status: err.status, ...err.diagnostic } : { code: "unexpected" }) }, null, 2);
      setMsg({ ok: false, text: explain?.(err) ?? errorText(err), log });
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
  const a = useAction("החלפת סיסמה", (e) => e instanceof CrowdError && e.code === "bad_credentials" ? "הסיסמה הנוכחית שהוקלדה אינה נכונה, ולכן הסיסמה לא הוחלפה. בדקו אותה ונסו שוב. שכחתם אותה? התנתקו ולחצו על \"שכחתי סיסמה\" במסך הכניסה." : null);
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
        <li>הגרסה האחרונה שלכם נכנסת לממוצע המשתתפים, בלי שום פרט מזהה. גם צוות האתר רואה את ההשערות בלי שם ובלי מייל.</li>
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
  const [forgot, setForgot] = useState(false);
  const a = useAction(mode === "register" ? "הרשמה" : "כניסה");
  const register = mode === "register";
  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2 text-sm font-bold">
        <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        הבנתי: הגרסה האחרונה שלי נכנסת לממוצע האנונימי של המשתתפים, ואפשר למחוק הכול בכל רגע.
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
          // הרשמה במייל ⇐ נשלח מייל אימות; כישלון אינו חוסם (אפשר לשלוח שוב ב"הפרטים שלי")
          let note = "";
          if (register) await call("/account/verify/send", { token: r.token, body: {} }).then(() => { note = " נשלח אליכם מייל לאימות הכתובת."; }, () => {});
          onDone?.(r.token);
          return (register ? "נרשמתם." : "נכנסתם.") + note;
        })}
      >
        <h3 className="font-bold">{register ? "או: הרשמה במייל" : "כניסה במייל"}</h3>
        <div className="grid sm:grid-cols-2 gap-3 items-start [&>*]:min-w-0">
          <Field label={register ? "מייל" : "מייל (או שם משתתף ישן)"}>
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
          {!register && (
            <button type="button" onClick={() => setForgot((x) => !x)} aria-expanded={forgot} className="min-h-[44px] px-2 text-sm font-bold underline underline-offset-2">
              שכחתי סיסמה
            </button>
          )}
        </div>
        {!register && <p className="text-xs text-ink">{FORGOT_LINE}</p>}
        {a.view}
      </form>
      {!register && forgot && <ForgotForm initialEmail={email} />}
      <PrivacyNote />
    </div>
  );
}

/** בקשת איפוס סיסמה במייל (הכרעת בעלים 10.10.2026): רק לחשבון עם מייל מאומת; התשובה זהה בין אם יש חשבון ובין אם לא */
function ForgotForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail.includes("@") ? initialEmail : "");
  const a = useAction("איפוס סיסמה");
  return (
    <form
      className="space-y-3 border border-paper-line rounded-theme p-3"
      onSubmit={a.run(async () => {
        await call("/auth/forgot", { body: { email } });
        return "אם הכתובת רשומה באתר ומאומתת, נשלח אליה מייל. פתחו בו את הקישור, ובדף שייפתח לחצו על Continue (המשך) כדי לקבוע סיסמה חדשה. המייל תקף 30 דקות, והוא מגיע בכותרת על אימות מייל — זה תקין.";
      })}
    >
      <h3 className="font-bold">איפוס סיסמה במייל</h3>
      <Field label="המייל שבחשבון" hint="האיפוס עובד רק למייל שאומת (Google או קישור אימות)">
        <input required type="email" maxLength={254} autoComplete="email" dir="ltr" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Btn type="submit" kind="primary" disabled={a.busy}>שליחת מייל לאיפוס</Btn>
      {a.view}
    </form>
  );
}

/** קביעת סיסמה חדשה מהקישור שבמייל האיפוס: הסוד נשמר בזיכרון בלבד (lib/resetPassword) */
export function ResetPasswordForm({ session }: { session: ReturnType<typeof useSession> }) {
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  const a = useAction("קביעת סיסמה חדשה");
  if (done) return <div className="space-y-2">{a.view}</div>;
  return (
    <form
      className="space-y-3"
      onSubmit={a.run(async () => {
        const r = await call<{ token: string }>("/auth/reset", { body: { secret: getResetSecret(), password: pw } });
        setPw("");
        clearResetSecret();
        setConsent(true);
        session.setToken(r.token, true);
        setDone(true);
        return "הסיסמה עודכנה ונכנסתם לחשבון. סיסמאות ישנות והכניסות במכשירים אחרים בוטלו.";
      })}
    >
      <PasswordField label="סיסמה חדשה" hint={`לפחות ${PW_MIN} תווים`} value={pw} onChange={setPw} mode="new" />
      <Btn type="submit" kind="primary" disabled={a.busy}>קביעת סיסמה</Btn>
      {a.view}
    </form>
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
        await call<{ email: string }>("/auth/claim", { token: session.token, body: { email, ...(needsPassword ? { password: pw } : {}) } });
        setPw("");
        let note = "";
        await call("/account/verify/send", { token: session.token, body: {} }).then(() => { note = " נשלח אליכם מייל לאימות הכתובת."; }, () => {});
        await session.refresh();
        onDone?.();
        return "המייל נוסף." + note;
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

/** אימות המייל (הכרעת בעלים 9.10.2026): נשלח מייל עם קישור (דרך Firebase); אחרי הלחיצה בו — "בדקתי" מאשר. נבדק גם אוטומטית כשחוזרים ללשונית. */
export function VerifyEmail({ session }: { session: ReturnType<typeof useSession> }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { token } = session;
  const check = async (quiet = false) => {
    setBusy(true);
    if (!quiet) setMsg(null);
    try {
      const r = await call<{ verified: boolean }>("/account/verify/check", { token, body: {} });
      if (r.verified) { await session.refresh(); setMsg({ ok: true, text: "המייל אומת." }); }
      else if (!quiet) setMsg({ ok: false, text: "עוד לא אומת. לחצו על הקישור במייל (בדקו גם בספאם), ואז נסו שוב." });
    } catch (e) {
      if (!quiet) setMsg({ ok: false, text: e instanceof CrowdError && e.code === "not_sent" ? "קודם שולחים מייל אימות." : errorText(e) });
    } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await call("/account/verify/send", { token, body: {} });
      setMsg({ ok: true, text: "נשלח מייל אימות. לחצו על הקישור שבו, וחזרו לכאן." });
    } catch (e) {
      // התשובה לא חזרה (חסימה ברשת) — ייתכן שהבקשה הגיעה והמייל נשלח
      setMsg({ ok: false, text: e instanceof CrowdError && e.code === "network" ? "לא התקבל אישור מהשרת. ייתכן שהמייל נשלח — בדקו את תיבת המייל (גם בספאם), או נסו שוב בעוד כמה דקות. אפשר גם להתחבר עם Google." : errorText(e) });
    } finally { setBusy(false); }
  };
  // חזרה ללשונית אחרי הלחיצה במייל ⇐ בדיקה שקטה
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible" && msg?.ok && !busy) void check(true); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <Btn onClick={send} disabled={busy}>שליחת מייל אימות</Btn>
        <Btn onClick={() => void check()} disabled={busy}>בדקתי — אימתתי</Btn>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-bold ${msg.ok ? "" : "text-warn"}`}>{msg.text}</p>}
    </div>
  );
}

export const mask = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, d: string) => a + "•".repeat(Math.min(6, b.length)) + d);

/** "הפרטים שלי" באזור האישי: Google, מייל, שם, סיסמה, יציאה. בלי חשבון ⇐ הרשמה או כניסה */
export default function Account({ session, hideGroups = false }: { session: ReturnType<typeof useSession>; hideGroups?: boolean }) {
  const { me, token } = session;
  const [showEmail, setShowEmail] = useState(false);
  const a = useAction("התנתקות");
  const blocked = useServerBlocked();
  if (!token) return <AuthForm session={session} />;
  // הסשן נשמר, אבל התשובות מהשרת נחסמות בדרך (סינון): במקום "טוען…" בלי סוף — הסבר ובקשה מוכנה לספק הסינון
  if (!me) return blocked ? <FilterBlocked signedIn onRetry={() => void session.refresh()} /> : <p className="text-ink-soft">טוען…</p>;
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
                <span className="block text-xs text-ink-soft">{e.verified ? (e.source === "google" ? "אומת ב-Google" : "אומת") : "לא אומת"}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-soft">אין עדיין.</p>}
        {emails.some((e) => !e.verified) && (me.verifyAvailable ? <VerifyEmail session={session} /> : <p className="text-xs text-ink-soft">אימות המייל יתאפשר בקרוב.</p>)}
        {!!emails.length && <button type="button" onClick={() => setShowEmail((x) => !x)} className="text-sm underline min-h-[44px]">{showEmail ? "הסתרה" : "הצגה מלאה"}</button>}
      </div>
      <div className={row}>
        <NameForm session={session} />
      </div>
      <div className={row}>
        <p className="font-bold">סיסמה</p>
        {me.hasPassword ? <NewPasswordForm session={session} /> : emails.length ? <SetPasswordForm session={session} /> : <p className="text-sm text-ink-soft">אפשר לקבוע סיסמה אחרי הוספת מייל.</p>}
      </div>
      {!hideGroups && (me.managedGroups ?? []).map((g) => <ManagedGroup key={g.id} id={g.id} name={g.name ?? g.id} slug={g.slug} image={g.image} members={g.members} token={token} className={row} onChanged={() => void session.refresh()} collapsible={(me.managedGroups ?? []).length > 1} />)}
      <div className="pt-3 grid sm:grid-cols-2 gap-3 [&>*]:min-w-0">
        <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: {} }), session.setToken(null), "התנתקתם מהמכשיר הזה."))}>התנתקות</Btn>
        <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: { all: true } }), session.setToken(null), "התנתקתם מכל המכשירים."))}>התנתקות מכל המכשירים</Btn>
      </div>
      {a.view}
    </div>
  );
}

type LinkFlag = { on: boolean; count: number | null };
type LinkMembersState = { min: number; all: LinkFlag; first: LinkFlag; list: number | null; site: number };
/**
 * מתגי המנהל (הכרעת בעלים 23.10.2026): לכלול כחברים, בנוסף לרשימת המיילים, את מי שנכנס דרך קישור הקבוצה —
 * כולם, או רק מי שהקישור היה הכניסה הראשונה שלו לאתר. הכניסות נרשמות תמיד (מזהה חשבון בלבד) ומשפיעות רק כשהמתג פעיל.
 * מספרי הקבוצה מוצגים מ-50 (כמו המספרים למנהל), כדי שלא יגלו אם אדם מסוים נרשם.
 */
export function LinkMembersToggle({ load, set, onChanged }: { load: () => Promise<LinkMembersState>; set: (flag: "all" | "first", on: boolean) => Promise<LinkMembersState>; onChanged?: () => void }) {
  const [state, setState] = useState<LinkMembersState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void load().then(setState).catch(() => setState(null)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const n = (v: number | null) => v === null ? `פחות מ-${state.min}` : v.toLocaleString("he-IL");
  const toggle = async (flag: "all" | "first") => { setBusy(true); try { setState(await set(flag, !state[flag].on)); onChanged?.(); } finally { setBusy(false); } };
  const Switch = ({ flag, label }: { flag: "all" | "first"; label: string }) => <button type="button" role="switch" aria-checked={state[flag].on} disabled={busy} onClick={() => void toggle(flag)} className="w-full flex items-center justify-between gap-3 min-h-[44px] text-sm text-start">
    <span><span className="font-bold">{label}</span> <span className="text-ink-soft">({n(state[flag].count)})</span></span>
    <span aria-hidden="true" className={`shrink-0 w-12 h-7 rounded-full border-2 border-ink p-0.5 flex ${state[flag].on ? "bg-ink justify-end" : "bg-paper-card justify-start"}`}><span className={`w-5 h-5 rounded-full ${state[flag].on ? "bg-paper-card" : "bg-ink"}`} /></span>
  </button>;
  return <div className="pt-2 space-y-1">
    <p className="font-bold pt-1">מי נספר בקבוצה</p>
    <ul className="text-sm space-y-0.5">
      <li>מרשימת המיילים, מחוברים לאתר: <strong>{n(state.list)}</strong></li>
      <li>חשבונות באתר בסך הכול: <strong>{state.site.toLocaleString("he-IL")}</strong></li>
    </ul>
    <Switch flag="all" label="לכלול את כל מי שנכנס דרך קישור הקבוצה" />
    <Switch flag="first" label="לכלול רק מי שהגיע לאתר לראשונה דרך הקישור" />
    <p className="text-xs text-ink-soft">בסוגריים: כמה חשבונות כאלה יש עכשיו. מתג פעיל מצרף אותם לקבוצה (גם מי שנכנסו לפני ההפעלה), בנוסף לרשימת המיילים. כל מי שיש לו את הקישור יכול להיכנס — כדאי להפעיל כשהקישור מופץ בתוך הקבוצה בלבד.</p>
  </div>;
}

/** תת-מגירה בניהול הקבוצה: התוכן (והבקשות לשרת) נטען רק כשהיא נפתחת */
function GroupFold({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group/f border-b border-paper-line last:border-b-0 [&_summary::-webkit-details-marker]:hidden" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[48px] font-bold text-sm">
        <span>{title}</span>
        <span aria-hidden="true" className="text-ink-soft text-lg transition-transform group-open/f:rotate-45">+</span>
      </summary>
      {open && <div className="space-y-3 pb-4">{children}</div>}
    </details>
  );
}

/** מקטע מנהל קבוצה: תתי-מגירות — קישור, מספרים, רשימת המיילים, תמונה והסבר. אותן אפשרויות כמו למנהל האתר */
export function ManagedGroup({ id, name, slug, image, members, token, className, onChanged, collapsible = false }: { id: string; name: string; slug?: string | null; image?: string | null; members?: number; token: string; className: string; onChanged?: () => void; collapsible?: boolean }) {
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(members ?? null);
  useEffect(() => { setCount(members ?? null); }, [members]);
  const send = async (chunk: { emails: string[]; mode: "add" | "replace" }) => {
    const r = await call<GroupImportResult>("/group/import", { token, body: { group: id, ...chunk } });
    setCount(r.members);
    return r;
  };
  const changed = () => { setRefresh((n) => n + 1); onChanged?.(); };
  const countText = count === null ? null : count === 0 ? "אין עדיין מיילים ברשימה" : `${count.toLocaleString("he-IL")} מיילים ברשימה`;
  const content = (
    <>
      <GroupFold title="קישור הקבוצה">
        <GroupLinkPanel
          slug={slug}
          setSlug={async (next) => { await call("/group/link", { token, body: next ? { group: id, slug: next } : { group: id } }); onChanged?.(); }}
          loadStats={() => call<GroupLinkStats>(`/group/link-stats?group=${encodeURIComponent(id)}`, { token })}
          bare
        />
      </GroupFold>
      <GroupFold title={<>רשימת המיילים{countText && <span className="font-normal text-ink-soft"> · {countText}</span>}</>}>
        <p className="text-sm">{countText ? <><strong>{countText}</strong> — כל המיילים שהעלו מנהלי הקבוצה, בלי קשר למי שכבר נרשם לאתר.</> : "טוען…"}</p>
        <GroupAddEmail add={(email) => send({ emails: [email], mode: "add" })} onDone={changed} />
        <GroupUpload send={send} onDone={changed} />
        <GroupClearMembers clear={() => send({ emails: [], mode: "replace" })} onDone={changed} />
      </GroupFold>
      <GroupFold title="מספרים">
        <GroupStats load={() => call<GroupStatsData>(`/group/stats?group=${encodeURIComponent(id)}`, { token })} refresh={refresh} />
        <LinkMembersToggle load={() => call<LinkMembersState>(`/group/link-members?group=${encodeURIComponent(id)}`, { token })} set={(flag, on) => call<LinkMembersState>("/group/link-members", { token, body: { group: id, flag, on } })} onChanged={changed} />
      </GroupFold>
      <GroupFold title="תמונת הקבוצה">
        <GroupImagePanel
          id={id}
          image={image}
          setImage={async (dataUrl) => { await call("/group/image", { token, body: dataUrl ? { group: id, image: dataUrl } : { group: id, remove: true } }); onChanged?.(); }}
          bare
        />
      </GroupFold>
      <GroupFold title="הסבר למנהל הקבוצה"><GroupManagerGuide bare /></GroupFold>
    </>
  );
  // מנהל של כמה קבוצות: לכל קבוצה תת-מגירה נפרדת; התוכן (והבקשות לשרת) נטענים רק כשהיא נפתחת
  if (collapsible)
    return (
      <details className={`group ps-3 border-s-2 border-paper-line [&_summary::-webkit-details-marker]:hidden ${className}`} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[56px] font-bold">
          <span>הקבוצה {name}</span>
          <span aria-hidden="true" className="text-ink-soft text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        {open && <div className="space-y-2 pb-3">{content}</div>}
      </details>
    );
  return (
    <div className={className}>
      <p className="font-bold">הקבוצה {name}</p>
      {content}
    </div>
  );
}
