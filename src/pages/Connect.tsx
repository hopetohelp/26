/**
 * מסך "חיבור עוזר AI" (הכרעת בעלים 12.10.2026) — לכאן העוזר (Claude, ChatGPT…) שולח את המשתמש כשהוא מתחבר לכתובת /mcp.
 * המשתמש רואה מי מבקש ולאיזה חשבון, מתחבר כרגיל אם צריך, ומאשר או מבטל. באישור: כניסת עוזר נפרדת משרת ההשתתפות
 * (POST /auth/delegate) נשלחת לשרת ה-MCP, והדפדפן חוזר לעוזר. אפשר לנתק בכל רגע: אזור אישי ⇐ עוזרי AI.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/ui";
import { call } from "../lib/crowdApi";
import { approveConnect, connectRequest, denyConnect, type ConnectRequest } from "../lib/mcp";
import Account, { mask, useAction } from "./guess/Account";
import { Btn } from "./guess/ui";
import { useSession } from "./guess/useCrowd";

export default function Connect() {
  const [params] = useSearchParams();
  const r = params.get("r") ?? "";
  const session = useSession();
  const { me, token } = session;
  const [req, setReq] = useState<ConnectRequest | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const a = useAction("חיבור עוזר AI", (e) => (e instanceof Error && !("status" in e) ? e.message : null));

  useEffect(() => {
    if (!r) { setFailed("חסרה בקשת חיבור. התחילו את החיבור מתוך העוזר."); return; }
    connectRequest(r).then(setReq, (e: Error) => setFailed(e.message));
  }, [r]);

  const email = me?.emails?.find((e) => e.email)?.email ?? null;
  const who = me?.name || (email ? mask(email) : "החשבון שלי");

  return (
    <div className="space-y-4">
      <PageTitle lead="העוזר יקרא את נתוני האתר, ויפעל בחשבון שלכם רק באישורכם.">חיבור עוזר AI</PageTitle>
      {failed && <p role="alert" className="text-sm bg-warn-soft text-warn rounded-theme px-3 py-2">{failed}</p>}
      {req && !token && (
        <section className="border border-paper-line rounded-theme p-4 md:p-5 space-y-3 bg-paper-card">
          <p className="font-bold text-lg">כדי לחבר את {req.client}, התחברו לחשבון באתר</p>
          <Account session={session} />
        </section>
      )}
      {req && token && !me && <p className="text-ink-soft">טוען…</p>}
      {req && token && me && (
        <section className="border border-paper-line rounded-theme p-4 md:p-5 space-y-4 bg-paper-card">
          <div>
            <p className="font-display text-2xl leading-tight">{req.client} מבקש לחבר את החשבון שלכם</p>
            <p className="text-sm text-ink-soft mt-1">החשבון: <bdi>{who}</bdi> · החזרה אל <bdi dir="ltr">{req.returnHost}</bdi></p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0 text-sm">
            <div>
              <p className="font-bold">מה העוזר יוכל</p>
              <ul className="list-disc ps-5 space-y-1">
                <li>לקרוא את כל נתוני האתר ולחשב מנדטים</li>
                <li>לקרוא את ההשערה, הגושים, ההצבעה, ההיסטוריה ו"הנתונים שלי"</li>
                <li>לשמור השערה, גושים והצבעה, לשנות שם ושיוך, ולמחוק את ההיסטוריה — כשתבקשו ממנו</li>
                <li>לקרוא את השיחה שלכם עם צוות האתר ולכתוב בה בשמכם — כשתבקשו ממנו (ההודעה מסומנת "נכתב דרך עוזר AI")</li>
                <li>קבוצות שאתם מנהלים{me.isAdmin ? ", ומסך הניהול (בלי מחיקת קבוצה, הסרת מנהלים ושיחות של אחרים)" : ""}</li>
              </ul>
            </div>
            <div>
              <p className="font-bold">מה העוזר לא יוכל</p>
              <ul className="list-disc ps-5 space-y-1">
                <li>לשנות סיסמה, מייל או חיבור Google</li>
                <li>למחוק את החשבון</li>
                <li>לנתק עוזרים או לחבר עוזר נוסף</li>
              </ul>
            </div>
          </div>
          <p className="text-sm text-ink-soft">אפשר לנתק בכל רגע: אזור אישי ⇐ עוזרי AI. החיבור בתוקף 30 יום.</p>
          <div className="flex flex-wrap gap-3">
            <Btn kind="primary" disabled={a.busy} onClick={a.run(async () => {
              const del = await call<{ token: string; expiresAt: string }>("/auth/delegate", { token, body: { client: req.client } });
              const { redirect } = await approveConnect(r, del.token, del.expiresAt);
              window.location.assign(redirect);
              return `מחזירים אתכם אל ${req.client}…`;
            })}>אישור החיבור</Btn>
            <Btn disabled={a.busy} onClick={a.run(async () => {
              const { redirect } = await denyConnect(r);
              window.location.assign(redirect);
              return "החיבור בוטל.";
            })}>ביטול</Btn>
          </div>
          {a.view}
        </section>
      )}
    </div>
  );
}
