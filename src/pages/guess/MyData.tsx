import { useState } from "react";
import { call } from "../../lib/crowdApi";
import { clearAll } from "../../lib/crowdSession";
import Account from "./Account";
import LinkSaver from "./LinkSaver";
import { Btn, inputCls, Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

/** החשבון, הקישור האישי, ייצוא ומחיקה */
export default function MyData({ session }: { session: ReturnType<typeof useSession> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [del, setDel] = useState(0);
  const [typed, setTyped] = useState("");
  const [rotateAsk, setRotateAsk] = useState(false);
  const { token, link } = session;

  if (!session.online) return <Notice>כשהשמירה תיפתח באתר, כאן יופיעו החשבון שלכם, ייצוא ומחיקה מלאה. בינתיים הכול נשמר רק בדפדפן הזה, כטיוטה.</Notice>;

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
      <Account session={session} />

      {token && (
        <section className="bg-paper-card border border-paper-line rounded-theme p-5 sm:p-6 space-y-4">
          <h3 className="font-display text-3xl leading-none text-center">הקישור האישי</h3>
          <p className="text-sm text-center leading-relaxed">
            הקישור האישי מכניס אתכם ישר להשערות שלכם, מכל מכשיר, וגם מאפשר לקבוע סיסמה חדשה. אין מייל באתר, ולכן זו <strong>הדרך היחידה</strong> לשחזר סיסמה שנשכחה.
          </p>
          {link ? (
            <LinkSaver token={link} />
          ) : (
            <p className="text-sm">הקישור לא שמור בדפדפן הזה. אם אינו אצלכם — צרו קישור חדש; הקודם יפסיק לעבוד.</p>
          )}
          <div className="flex justify-center gap-3 flex-wrap border-t border-paper-line pt-4">
            <Btn onClick={exportJson}>ייצוא (JSON)</Btn>
            {!rotateAsk ? (
              <Btn onClick={() => setRotateAsk(true)}>קישור אישי חדש</Btn>
            ) : (
              <span className="flex gap-2 items-center flex-wrap">
                <span className="text-sm">הקישור הקודם יפסיק לעבוד מיד.</span>
                <Btn
                  kind="primary"
                  onClick={() =>
                    run(async () => {
                      const r = await call<{ link: string }>("/link/rotate", { token, body: {} });
                      session.setLink(r.link);
                      setRotateAsk(false);
                      setMsg("נוצר קישור אישי חדש. שמרו אותו עכשיו — בהעתקה, בשליחה לעצמכם או בהורדה כקובץ.");
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
      )}

      {token && (
        <section className="bg-paper-card border-2 border-warn rounded-theme p-5 sm:p-6 space-y-4 text-center">
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
