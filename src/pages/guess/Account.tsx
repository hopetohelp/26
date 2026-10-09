import { useState, type FormEvent } from "react";
import { call, CrowdError } from "../../lib/crowdApi";
import { hasConsent, setConsent } from "../../lib/crowdSession";
import { maskIdentifier } from "../../lib/identifier";
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

/** מה נשמר ומי רואה — מקופל, כדי שהטופס יישאר קצר */
function PrivacyNote() {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-bold min-h-[44px] flex items-center">מה נשמר ומי רואה?</summary>
      <ul className="list-disc ps-5 space-y-1 pb-2">
        <li>מה שתשמרו נשמר בשרת האתר, בלי שם אמיתי. אם תבחרו כתובת מייל כשם משתמש, היא נשמרת בשרת, לא מוצגת לאיש ולא נשלח אליה דבר; לשחזור משתמשים בקישור האישי.</li>
        <li>הגרסה האחרונה שלכם נכנסת לממוצע הגולשים, בלי שום פרט מזהה. הנתונים מוצגים גם עבור משתתף יחיד; בקבוצות קטנות אפשר להסיק תשובות ללא שם. מספר משתתפים קטן אינו משקף את הציבור.</li>
        <li>אם החיבור לשרת נכשל, נשלח אלינו דיווח אוטומטי עם פרטים טכניים בלבד: סוג הדפדפן, איזה חלק נכשל ותוצאת בדיקת חיבור. בלי שם, סיסמה או ההשערה.</li>
        <li>אף אחד אחר לא רואה את ההשערה האישית שלכם. אפשר למחוק הכול בכל רגע ב"הנתונים שלי".</li>
      </ul>
    </details>
  );
}

/**
 * הרשמה, כניסה, או (בגיליון השמירה) שמירה בלי משתמש.
 * הרשמה: שם משתמש וסיסמה (מומלץ) ⇐ קישור אישי לשחזור. בלי משתמש (הכרעת בעלים 8.10.2026): נשמר בשרת, אבל אי אפשר לשחזר.
 * ההסכמה (הגרסה האחרונה נכנסת לממוצע האנונימי) נדרשת פעם אחת לפני כל שמירה ראשונה.
 */
export function AuthForm({
  session,
  onDone,
  initial = "register",
  submitSuffix = "",
  allowGuest = false,
}: {
  session: ReturnType<typeof useSession>;
  onDone?: (token: string) => void;
  initial?: "login" | "register";
  submitSuffix?: string;
  allowGuest?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register">(initial);
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(hasConsent);
  const a = useAction(mode === "register" ? "הרשמה לפני שמירה" : "כניסה לפני שמירה");
  const g = useAction("שמירה בלי משתמש");
  const consent = (
    <label className="flex items-start gap-2 text-sm font-bold">
      <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
      הבנתי: הגרסה האחרונה שלי נכנסת לממוצע האנונימי של הגולשים, ואפשר למחוק הכול בכל רגע.
    </label>
  );
  const accountForm = (
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
      {!allowGuest && <h3 className="font-bold">{mode === "register" ? "הרשמה" : "כניסה"}</h3>}
      <div className="grid sm:grid-cols-2 gap-3 items-start [&>*]:min-w-0">
        <Field label="שם משתמש או מייל" hint={mode === "register" ? "3–24 אותיות או ספרות, או כתובת מייל. לא נשלח אליה דבר והיא לא מוצגת לאיש." : undefined}>
          <input required minLength={3} maxLength={254} autoComplete="username" dir="ltr" className={inputCls} value={u} onChange={(e) => setU(e.target.value)} />
        </Field>
        <PasswordField label="סיסמה" hint={mode === "register" ? `לפחות ${PW_MIN} תווים` : undefined} value={pw} onChange={setPw} mode={mode === "login" ? "current" : "new"} />
      </div>
      {mode === "register" && !allowGuest && consent}
      <div className="flex gap-2 flex-wrap items-center">
        <Btn type="submit" kind={allowGuest ? "ghost" : "primary"} disabled={a.busy || (mode === "register" && !agree)}>
          {(mode === "login" ? "כניסה" : "הרשמה") + submitSuffix}
        </Btn>
        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="min-h-[44px] px-2 text-sm font-bold underline underline-offset-2">
          {mode === "login" ? "אין לי חשבון — הרשמה" : "כבר יש לי חשבון"}
        </button>
      </div>
      {mode === "register" && allowGuest && !agree && <p className="text-xs text-ink">כדי להירשם סמנו קודם "הבנתי" למעלה.</p>}
      {mode === "login" && <p className="text-xs text-ink">{FORGOT_LINE}</p>}
      {a.view}
    </form>
  );

  // בגיליון השמירה: קודם ערך, אחר כך מחויבות (הכרעת בעלים 8.10.2026) — שמירה בלחיצה אחת היא הפעולה הראשית,
  // והרשמה או כניסה הן אפשרות משנית; אחרי השמירה מוצעת הוספת שם משתמש (ClaimForm).
  if (allowGuest)
    return (
      <div className="space-y-4">
        <section className="space-y-3" aria-label="שמירה עכשיו">
          {consent}
          <Btn
            kind="primary"
            className="w-full"
            disabled={g.busy || !agree}
            onClick={g.run(async () => {
              const r = await call<{ token: string }>("/auth/guest", { body: {} });
              setConsent(true);
              session.setToken(r.token);
              onDone?.(r.token);
              return "נשמר.";
            })}
          >
            {g.busy ? "שומר…" : "שמירה עכשיו"}
          </Btn>
          {!agree && <p className="text-xs text-ink">כדי לשמור סמנו קודם "הבנתי".</p>}
          <p className="text-sm text-ink">בלי שם ובלי סיסמה. אחרי השמירה אפשר להוסיף שם משתמש, כדי לחזור להשערה מכל מכשיר.</p>
          {g.view}
        </section>
        <section className="space-y-2 border-t border-paper-line pt-3" aria-label="כניסה עם Google">
          <p className="text-sm font-bold">או: המשך עם Google — כדי לחזור להשערה מכל מכשיר</p>
          <GoogleButton session={session} onDone={onDone} disabled={!agree} />
          {!agree && <p className="text-xs text-ink">הכפתור יופיע אחרי סימון "הבנתי".</p>}
          <p className="text-xs text-ink">מ-Google לא נשמר מייל ולא שם, רק מזהה פנימי.</p>
        </section>
        <details className="border-t border-paper-line pt-3" open={initial === "login"}>
          <summary className="cursor-pointer font-bold min-h-[44px] flex items-center">כבר יש לי חשבון, או: הרשמה עם שם משתמש</summary>
          <div className="pt-2">{accountForm}</div>
        </details>
        <PrivacyNote />
      </div>
    );

  return (
    <div className="space-y-4">
      {accountForm}
      {mode === "register" && <PrivacyNote />}
    </div>
  );
}

/** מי שנשמר בלי משתמש: הוספת שם משתמש וסיסמה בלי לאבד את מה ששמר; נוצר קישור אישי לשחזור */
export function ClaimForm({ session, onDone }: { session: ReturnType<typeof useSession>; onDone?: () => void }) {
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const a = useAction("הוספת שם משתמש");
  return (
    <form
      className="space-y-3"
      onSubmit={a.run(async () => {
        const r = await call<{ username: string; link: string }>("/auth/claim", { token: session.token, body: { username: u, password: pw } });
        setPw("");
        session.setLink(r.link);
        await session.refresh();
        onDone?.();
        return "נוסף שם משתמש. שמרו עכשיו את הקישור האישי.";
      })}
    >
      <div className="grid sm:grid-cols-2 gap-3 items-start [&>*]:min-w-0">
        <Field label="שם משתמש או מייל" hint="3–24 אותיות או ספרות, או כתובת מייל. לא נשלח אליה דבר והיא לא מוצגת לאיש.">
          <input required minLength={3} maxLength={254} autoComplete="username" dir="ltr" className={inputCls} value={u} onChange={(e) => setU(e.target.value)} />
        </Field>
        <PasswordField label="סיסמה" hint={`לפחות ${PW_MIN} תווים`} value={pw} onChange={setPw} mode="new" />
      </div>
      <Btn type="submit" kind="primary" disabled={a.busy}>
        הוספת שם משתמש
      </Btn>
      {a.view}
    </form>
  );
}

/** החשבון: מחוברים ⇐ יציאה והחלפת סיסמה · לא מחוברים ⇐ הרשמה או כניסה */
export default function Account({ session }: { session: ReturnType<typeof useSession> }) {
  const { me, token } = session;
  const a = useAction("התנתקות");

  if (token && me?.username) {
    return (
      <section className="bg-paper-card border border-paper-line rounded-theme p-4 md:p-5 space-y-4">
        <h3 className="text-xl font-display leading-tight text-center">החשבון</h3>
        <p className="text-sm text-center">
          מחוברים בשם <bdi className="font-bold">{maskIdentifier(me.username)}</bdi>.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 [&>*]:min-w-0">
          <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: {} }), session.setToken(null), "התנתקתם מהמכשיר הזה."))}>התנתקות</Btn>
          <Btn onClick={a.run(async () => (await call("/auth/logout", { token, body: { all: true } }), session.setToken(null), "התנתקתם מכל המכשירים."))}>התנתקות מכל המכשירים</Btn>
        </div>
        {a.view}
        <h4 className="font-bold text-center pt-4 border-t border-paper-line">החלפת סיסמה</h4>
        <NewPasswordForm session={session} />
      </section>
    );
  }

  if (token && me?.guest) {
    return (
      <section className="bg-paper-card border-2 border-warn rounded-theme p-4 md:p-5 space-y-3">
        <h3 className="text-xl font-display leading-tight">נשמרתם בלי משתמש</h3>
        <p className="text-sm text-ink">אי אפשר לשחזר את ההשערה אם תחליפו מכשיר או תמחקו נתוני דפדפן. הוסיפו שם משתמש וסיסמה כדי להישאר מחוברים מכל מכשיר.</p>
        <GoogleButton session={session} onDone={() => void session.refresh()} />
        <ClaimForm session={session} />
      </section>
    );
  }

  return (
    <section className="bg-paper-card border border-paper-line rounded-theme p-4 md:p-5 space-y-3">
      <h3 className="text-xl font-display leading-tight">חשבון</h3>
      <p className="text-sm text-ink">הרשמה בשם משתמש וסיסמה (בלי שם אמיתי ובלי מייל) מאפשרת לחזור להשערה מכל מכשיר. עד אז הטיוטות נשמרות רק בדפדפן הזה.</p>
      <GoogleButton session={session} />
      <p className="text-xs text-ink">בכניסה מאשרים שהגרסה האחרונה שלכם נכנסת לממוצע האנונימי של הגולשים. מ-Google לא נשמר מייל ולא שם.</p>
      <AuthForm session={session} />
    </section>
  );
}
