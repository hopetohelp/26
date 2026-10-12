/**
 * "עוזרי AI" באזור האישי (הכרעת בעלים 12.10.2026): איך מחברים עוזר (Claude, ChatGPT…) לאתר, ורשימת העוזרים
 * המחוברים לחשבון עם ניתוק. החיבור עצמו נעשה במסך "חיבור עוזר AI" (src/pages/Connect.tsx), שהעוזר פותח.
 * מה שעוזר מחובר רשאי — אותן הרשאות כמו באתר, חוץ מסיסמה, מייל, Google ומחיקת החשבון (worker/crowd/lib/agent.js).
 */
import { useCallback, useEffect, useState } from "react";
import { call } from "../../lib/crowdApi";
import { MCP_ADDRESSES, type Connection } from "../../lib/mcp";
import { date } from "../../lib/format";
import { Btn } from "./ui";
import { useAction } from "./Account";
import type { useSession } from "./useCrowd";

function Address({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => {});
  return (
    <div className="py-2">
      <p className="text-sm font-bold">{label}</p>
      <div className="flex flex-wrap items-center gap-2 [&>*]:min-w-0">
        <code dir="ltr" className="text-sm bg-paper rounded-theme px-2 py-1 break-all">{url}</code>
        <Btn onClick={copy} aria-label={`העתקת הכתובת: ${label}`}>{copied ? "הועתק" : "העתקה"}</Btn>
      </div>
    </div>
  );
}

/** ההסבר והכתובות — גם בלי חשבון (הכתובת הציבורית פתוחה לכולם) */
export function AssistantsHowTo({ signedIn }: { signedIn: boolean }) {
  if (!MCP_ADDRESSES) return <p className="text-sm text-ink-soft">החיבור לעוזרי AI עוד לא פעיל באתר.</p>;
  return (
    <div className="space-y-3 text-sm">
      <p>אפשר לחבר לאתר עוזר AI (למשל Claude או ChatGPT) ולשאול אותו על הסקרים, התרחישים והתוצאות. העוזר עונה רק מנתוני האתר, בכרטיס בעיצוב האתר, ועם "איך זה חושב?" לכל מספר.</p>
      <Address label="בלי התחברות — נתוני האתר ומחשבון המנדטים" url={MCP_ADDRESSES.public} />
      <Address label="עם התחברות לחשבון — גם ההשערה, הגושים, ההצבעה וההיסטוריה שלכם" url={MCP_ADDRESSES.withLogin} />
      <div>
        <p className="font-bold">איך מחברים</p>
        <ul className="list-disc ps-5 space-y-1">
          <li><strong>Claude:</strong> הגדרות (Settings) ⇐ מחברים (Connectors) ⇐ הוספת מחבר מותאם אישית (Add custom connector) ⇐ מדביקים את הכתובת ⇐ התחברות (Connect).</li>
          <li><strong>ChatGPT:</strong> הגדרות (Settings) ⇐ אפליקציות ומחברים (Apps &amp; Connectors) ⇐ הגדרות מתקדמות (Advanced settings) ⇐ מצב מפתחים (Developer mode) ⇐ יצירה (Create) ⇐ מדביקים את הכתובת.</li>
        </ul>
        <p className="text-ink-soft mt-1">בכתובת עם התחברות העוזר פותח את מסך "חיבור עוזר AI" באתר, ושם מאשרים. {signedIn ? "" : "צריך חשבון באתר."}</p>
      </div>
      <p className="text-ink-soft">מה עוזר מחובר יכול: לקרוא ולשנות את מה שאתם יכולים באתר (השערה, גושים, הצבעה, שיוך, שם, מחיקת ההיסטוריה, קבוצות שאתם מנהלים). מה הוא לא יכול: סיסמה, מייל, חיבור Google ומחיקת החשבון — רק כאן באתר.</p>
    </div>
  );
}

/** רשימת העוזרים המחוברים לחשבון, וניתוק */
export default function Assistants({ session }: { session: ReturnType<typeof useSession> }) {
  const { token } = session;
  const [list, setList] = useState<Connection[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const a = useAction("ניתוק עוזר AI");
  const load = useCallback(async () => {
    if (!token) return;
    try {
      setList((await call<{ connections: Connection[] }>("/account/connections", { token })).connections);
      setLoadError(false);
    } catch { setLoadError(true); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="space-y-3">
      <AssistantsHowTo signedIn={!!token} />
      {token && (
        <section aria-label="העוזרים המחוברים" className="border-t border-paper-line pt-3">
          <p className="font-bold">העוזרים המחוברים לחשבון</p>
          {loadError && <p className="text-sm text-ink-soft">לא הצלחנו לטעון את הרשימה. <button type="button" className="underline min-h-[44px]" onClick={() => void load()}>ניסיון נוסף</button></p>}
          {list && !list.length && <p className="text-sm text-ink-soft">אין עוזרים מחוברים.</p>}
          {list && list.length > 0 && (
            <ul className="divide-y divide-paper-line">
              {list.map((c) => (
                <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2 [&>*]:min-w-0">
                  <div>
                    <p className="font-bold">{c.client}</p>
                    <p className="text-xs text-ink-soft">חובר ב-{date(c.createdAt)}{c.lastUsedAt ? ` · שימוש אחרון ${date(c.lastUsedAt)}` : ""} · בתוקף עד {date(c.expiresAt)}</p>
                  </div>
                  <Btn kind="danger" disabled={a.busy} onClick={a.run(async () => (await call("/account/connections/revoke", { token, body: { id: c.id } }), await load(), `${c.client} נותק.`))}>ניתוק</Btn>
                </li>
              ))}
            </ul>
          )}
          {list && list.length > 1 && <Btn kind="danger" disabled={a.busy} onClick={a.run(async () => (await call("/account/connections/revoke", { token, body: { all: true } }), await load(), "כל העוזרים נותקו."))}>ניתוק כל העוזרים</Btn>}
          {a.view}
        </section>
      )}
    </div>
  );
}
