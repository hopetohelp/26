import { useState } from "react";
import { call } from "../../lib/crowdApi";
import { clearAll } from "../../lib/crowdSession";
import { Btn, inputCls, Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

/** ייצוא ומחיקה — מגירת "הנתונים שלי" באזור האישי (מגירת הקישור האישי הוסרה 10.10.2026) */
export default function MyData({ session, part }: { session: ReturnType<typeof useSession>; part: "data" }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [del, setDel] = useState(0);
  const [typed, setTyped] = useState("");
  const { token } = session;

  if (!session.online) return <Notice>כשהשמירה תיפתח באתר, כאן יופיעו החשבון שלכם, ייצוא ומחיקה מלאה. בינתיים הכול נשמר רק בדפדפן הזה, כטיוטה.</Notice>;
  if (!token) return <p className="text-sm text-ink-soft">בלי חשבון הכול נשמר רק בדפדפן הזה.</p>;

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
      {part === "data" && (
        <section className="space-y-3">
          <p className="text-sm">כל מה ששמרתם — ההשערות, ההיסטוריה והפרטים — בקובץ אחד.</p>
          <Btn onClick={exportJson}>ייצוא (JSON)</Btn>
        </section>
      )}

      {part === "data" && (
        <section className="border-2 border-warn rounded-theme p-4 space-y-4">
          <h3 className="text-xl font-display leading-tight text-warn">מחיקה מלאה</h3>
          <p className="text-sm">מוחקת את כל ההשערות, ההיסטוריה, המייל, השם, שיחת התמיכה ופרטי הכניסה. ממוצעים שכבר פורסמו לא משתנים.</p>
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
