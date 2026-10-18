import { useEffect, useRef, useState } from "react";
import { Btn, Notice } from "./guess/ui";
import { PRIVATE_ERROR_TEXT, askPrivate, clearPrivateHistory, isPlausibleKey, loadPrivateHistory, removePrivateKey, savePrivateKey, usePrivateKey, type KeyPlace, type PrivateTurn } from "../lib/privateChat";
import { getToken } from "../lib/crowdSession";

/**
 * הצ'אט הפרטי (הכרעת בעלים 14.10.2026): מי שהדביק מפתח AI משלו שואל מה שהוא רוצה על נתוני האתר, על חשבונו.
 * רכיב נפרד לגמרי מהשיחה עם צוות האתר. המפתח — בחשבון או במכשיר בלבד; השיחה — מוצפנת בחשבון, ובלי חשבון בזיכרון הדף (src/lib/privateChat.ts).
 */
const MAX_QUESTION = 2000;

function Bubble({ turn }: { turn: PrivateTurn }) {
  const mine = turn.role === "user";
  return <li className={`max-w-[85%] rounded-theme px-3.5 py-2.5 ${mine ? "self-start bg-paper-line/50" : "self-end bg-accent-soft"}`}>
    <p className="text-xs font-bold text-ink-soft mb-1">{mine ? "אתם" : "העוזר"}</p>
    <p className="whitespace-pre-wrap break-words">{turn.text}</p>
  </li>;
}

/** בסוג "שאלה או תאוריה": חיבור מפתח אישי. מוצג רק למי שעוד לא חיבר. */
export function PrivateKeyEntry() {
  const key = usePrivateKey();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = !!getToken();
  const [place, setPlace] = useState<KeyPlace>(signedIn ? "account" : "device");
  if (key) return null;
  const save = async () => {
    const v = value.trim();
    if (!isPlausibleKey(v)) return setError("המפתח לא נראה תקין. בדקו שהועתק במלואו, בלי רווחים.");
    setBusy(true);
    const e = await savePrivateKey(v, place);
    setBusy(false);
    if (e) return setError(e);
    setValue(""); setError(null); setOpen(false);
  };
  return (
    <div className="text-xs">
      {!open ? (
        <button type="button" className="underline text-ink-soft min-h-[44px] text-start" aria-expanded="false" onClick={() => setOpen(true)}>מומלץ: חברו מפתח AI אישי ושאלו כל שאלה על נתוני האתר, עם תשובה מיידית</button>
      ) : (
        <form className="space-y-2 border border-paper-line rounded-theme p-3 text-sm" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <p className="font-bold">מפתח AI אישי — שיחה פרטית על חשבונכם</p>
          <p className="text-xs text-ink-soft">עם מפתח משלכם (Google Gemini או Anthropic) תוכלו לשאול כל שאלה על נתוני האתר, בשיחה פרטית. העלות — אצל הספק שלכם. המפתח אינו מוצג לאף אחד, גם לא לצוות. כשאתם מחוברים לחשבון, השיחה נשמרת אצלנו מוצפנת ונפתחת רק לכם.</p>
          <fieldset className="space-y-1 text-xs">
            <legend className="sr-only">היכן לשמור את המפתח</legend>
            <label className="flex items-center gap-2 min-h-[44px]"><input type="radio" name="key-place" checked={place === "account"} disabled={!signedIn} onChange={() => setPlace("account")} />בחשבון שלי — מוצפן, זמין מכל מכשיר{!signedIn && " (צריך להיכנס לחשבון)"}</label>
            <label className="flex items-center gap-2 min-h-[44px]"><input type="radio" name="key-place" checked={place === "device"} onChange={() => setPlace("device")} />במכשיר הזה בלבד</label>
          </fieldset>
          <label className="block"><span className="sr-only">מפתח AI אישי</span>
            <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="הדביקו מפתח API" className="w-full rounded-theme border border-paper-line bg-paper text-ink p-2 text-sm" />
          </label>
          <div className="flex gap-2 flex-wrap">
            <Btn type="submit" kind="primary" disabled={!value.trim() || busy}>{busy ? "שומרים…" : "חיבור המפתח"}</Btn>
            <Btn onClick={() => { setOpen(false); setError(null); setValue(""); }}>ביטול</Btn>
          </div>
          {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
        </form>
      )}
    </div>
  );
}

export default function PrivateChat() {
  const key = usePrivateKey();
  const [history, setHistory] = useState<PrivateTurn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { list.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [history, busy]);
  // השיחה השמורה בחשבון נטענת; מפתח שהוסר ⇐ השיחה יורדת מהמסך (ונשארת שמורה בחשבון)
  useEffect(() => { if (!key) { setHistory([]); setText(""); setError(null); } else void loadPrivateHistory().then((t) => { if (t.length) setHistory(t); }); }, [key]);

  async function send() {
    const q = text.trim();
    if (!key || !q || busy || q.length > MAX_QUESTION) return;
    setBusy(true); setError(null);
    const res = await askPrivate(history, q);
    setBusy(false);
    if (!res.ok) return setError(PRIVATE_ERROR_TEXT[res.error]);
    setHistory((h) => [...h, { role: "user", text: q }, { role: "assistant", text: res.text }]);
    setText("");
  }

  if (!key) return null;
  return (
    <section aria-labelledby="private-title" className="flex-1 flex flex-col">
      <h2 id="private-title" className="font-bold text-lg pt-4 pb-2">שיחה פרטית</h2>
      <div className="pb-2"><Notice>שיחה פרטית על נתוני האתר, על חשבונכם: {getToken() ? "השאלות והתשובות נשמרות אצלנו מוצפנות, נפתחות רק לכם ואינן נראות לצוות." : "בלי חשבון השאלות והתשובות נשארות רק בדף הזה."} התשובות מבוססות על נתוני האתר בלבד, ללא המלצות הצבעה.</Notice></div>
      <div className="flex-1 flex flex-col">
        <ol ref={list} className="mt-auto flex flex-col gap-3 pb-3" aria-label="שיחה פרטית" aria-live="polite">
          {history.length === 0 && <li className="text-ink-soft text-sm">שאלו כל שאלה על הסקרים, המודל, התוצאות הקודמות או חוק הבחירות.</li>}
          {history.map((t, i) => <Bubble key={i} turn={t} />)}
          {busy && <li className="text-ink-soft text-sm">העוזר חושב…</li>}
        </ol>
      </div>
      <form className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 z-20 -mx-4 px-4 md:mx-0 md:px-0 border-t border-paper-line bg-paper pt-3 pb-3 md:pb-4 space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div className="flex gap-2 items-end">
          <label htmlFor="private-message" className="sr-only">שאלה פרטית על נתוני האתר</label>
          <textarea id="private-message" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={MAX_QUESTION} placeholder="כתבו שאלה…" className="flex-1 min-w-0 resize-none overflow-y-auto border border-ink-faint rounded-theme p-3 bg-paper-card" />
          <Btn type="submit" kind="primary" disabled={!text.trim() || busy}>{busy ? "שולחים…" : "שליחה"}</Btn>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn onClick={() => { setHistory([]); setError(null); void clearPrivateHistory(); }} disabled={!history.length || busy}>מחיקת השיחה</Btn>
          <Btn onClick={() => void removePrivateKey()}>{key === "device" ? "הסרת המפתח מהמכשיר" : "הסרת המפתח מהחשבון"}</Btn>
        </div>
        {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
      </form>
    </section>
  );
}
