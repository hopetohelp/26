import { useState } from "react";
import { call } from "../../lib/crowdApi";
import { clearAll } from "../../lib/crowdSession";
import Account from "./Account";
import { Btn, inputCls, Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

export const personalLink = (token: string) => `${location.origin}${location.pathname}#/guess?t=${encodeURIComponent(token)}`;

/** הקישור האישי, ייצוא, החלפה ומחיקה — ותיבת החשבון */
export default function MyData({ session }: { session: ReturnType<typeof useSession> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [del, setDel] = useState(0);
  const [typed, setTyped] = useState("");
  const [rotateAsk, setRotateAsk] = useState(false);
  const { token } = session;

  if (!session.online) return <Notice>כשהשמירה תיפתח באתר, כאן יופיעו הקישור האישי שלכם, ייצוא, ומחיקה מלאה. בינתיים הכול נשמר רק בדפדפן הזה, כטיוטה.</Notice>;

  const run = async (fn: () => Promise<void>) => {
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  const exportJson = () =>
    run(async () => {
      const data = await call<unknown>("/export", { token });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: "ההשערה-שלי.json" });
      a.click();
      URL.revokeObjectURL(url);
    });

  return (
    <div className="space-y-5">
      {token ? (
        <section className="space-y-2">
          <h3 className="font-display text-3xl leading-none">הקישור האישי</h3>
          <p className="text-sm">הקישור הזה הוא המפתח להשערות שלכם, מכל מכשיר. אין לנו דרך לשחזר אותו: <strong>קישור שאבד — אבוד</strong>, אלא אם הוספתם שם משתמש וסיסמה.</p>
          <div className="flex gap-2 flex-wrap items-center">
            <input readOnly aria-label="הקישור האישי" value={personalLink(token)} dir="ltr" className={`${inputCls} flex-1 min-w-0 text-xs`} onFocus={(e) => e.target.select()} />
            <Btn onClick={() => run(async () => (await navigator.clipboard.writeText(personalLink(token)), setMsg("הקישור הועתק. שמרו אותו במקום בטוח.")))}>העתקה</Btn>
          </div>
          <p className="text-xs text-ink-soft">אל תשתפו אותו — מי שמחזיק בו יכול לשנות ולמחוק.</p>
          <div className="flex gap-2 flex-wrap">
            <Btn onClick={exportJson}>ייצוא (JSON)</Btn>
            {!rotateAsk ? (
              <Btn onClick={() => setRotateAsk(true)}>קישור חדש</Btn>
            ) : (
              <span className="flex gap-2 items-center flex-wrap">
                <span className="text-sm">הקישור הנוכחי יפסיק לעבוד מיד.</span>
                <Btn
                  kind="primary"
                  onClick={() =>
                    run(async () => {
                      const r = await call<{ token: string }>("/link/rotate", { token, body: {} });
                      session.setToken(r.token);
                      setRotateAsk(false);
                      setMsg("נוצר קישור חדש. העתיקו אותו עכשיו.");
                    })
                  }
                >
                  ליצור קישור חדש
                </Btn>
                <Btn onClick={() => setRotateAsk(false)}>ביטול</Btn>
              </span>
            )}
          </div>
        </section>
      ) : (
        <Notice>עוד לא שמרתם, אז אין עדיין קישור אישי. הוא נוצר בשמירה הראשונה.</Notice>
      )}

      <Account session={session} />

      {token && (
        <section className="border-2 border-warn rounded-theme p-4 space-y-2">
          <h3 className="font-display text-3xl leading-none text-warn">מחיקה מלאה</h3>
          <p className="text-sm">מוחקת את כל ההשערות, ההיסטוריה ופרטי הכניסה. ממוצעים שכבר פורסמו לא משתנים.</p>
          {del === 0 && (
            <Btn kind="danger" onClick={() => setDel(1)}>
              למחוק את הכול
            </Btn>
          )}
          {del === 1 && (
            <div className="space-y-2">
              <label className="text-sm block">
                <span className="font-bold block mb-1">כדי לאשר, הקלידו: מחק</span>
                <input className={`${inputCls} max-w-[12rem]`} value={typed} onChange={(e) => setTyped(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <Btn
                  kind="danger"
                  disabled={typed.trim() !== "מחק"}
                  onClick={() =>
                    run(async () => {
                      await call("/delete", { token, body: { confirm: "מחק" } });
                      clearAll();
                      session.setToken(null);
                      setDel(0);
                      setMsg("הכול נמחק.");
                    })
                  }
                >
                  מחיקה סופית
                </Btn>
                <Btn onClick={() => (setDel(0), setTyped(""))}>ביטול</Btn>
              </div>
            </div>
          )}
        </section>
      )}
      {msg && (
        <p role="status" className="text-sm font-bold">
          {msg}
        </p>
      )}
    </div>
  );
}
