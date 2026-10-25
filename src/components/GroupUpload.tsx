import { useState } from "react";
import { Segmented } from "./Choice";
import { Btn, Notice } from "../pages/guess/ui";
import type { GroupImportResult } from "../lib/crowdApi";
import { emailsFromText, sendWithSplit, uploadChunks, uploadStaged, type StagedApi } from "../lib/groupUpload";
import { CrowdError } from "../lib/crowdApi";
import ConfirmDialog from "./ConfirmDialog";

/**
 * העלאת רשימת חברי קבוצה (docs/פילוח-קבוצות-תכנון.md): קובץ עם מייל בכל שורה, נשלח במנות. בשרת נשמר רק הגיבוב של כל מייל.
 * משמש את מנהל האתר (ממשק הניהול) ואת מנהל הקבוצה (האזור האישי). send = שליחת מנה אחת.
 * החלפת הרשימה נפתחת בחלון "האם אתם בטוחים?" עם מספר המיילים שיימחקו (current) ומספר המיילים בקובץ (הכרעת בעלים 24.10.2026).
 */
export default function GroupUpload({ send, staged, onDone, current }: { send: (chunk: { emails: string[]; mode: "add" | "replace" }) => Promise<GroupImportResult>; staged?: StagedApi; onDone?: () => void; current?: number | null }) {
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<string[] | null>(null);

  const upload = async () => {
    if (!file) return;
    setError(null); setDone(null);
    let text: string;
    try { text = await file.text(); } catch { setError("לא הצלחנו לקרוא את הקובץ. אפשר לשמור אותו מחדש כקובץ טקסט או CSV ולנסות שוב."); return; }
    const emails = emailsFromText(text);
    if (!emails.length && mode !== "replace") { setError("לא נמצאו מיילים בקובץ."); return; }
    if (mode === "replace") { setAsk(emails); return; }
    await run(emails);
  };

  const run = async (emails: string[]) => {
    // העלאה בשלבים: הקובץ נשמר בשרת ומעובד שם; שרת ישן (404) ⇐ המסלול הקודם, במנות
    if (staged) {
      try {
        setBusy("שומר את הקובץ…");
        const r = await uploadStaged(staged, emails, mode, (done, total) => setBusy(`מעבד ${done.toLocaleString("he-IL")} מתוך ${total.toLocaleString("he-IL")}…`));
        setDone(`הועלה. נוספו ${r.added}${r.invalid ? `, ${r.invalid} שורות לא תקינות` : ""}.${r.members !== null ? ` ברשימה עכשיו ${r.members} מיילים.` : ""}`);
        setBusy(null); onDone?.();
        return;
      } catch (e) {
        if (!((e instanceof CrowdError && e.status === 404) || (e instanceof Error && e.message.includes("(404)")))) {
          setError("ההעלאה נעצרה. הקובץ שכבר נשמר בשרת ממשיך להיות מעובד לבד; אפשר גם להעלות שוב את אותו קובץ במצב \"הוספה\" — מייל שכבר ברשימה לא נכפל.");
          setBusy(null); onDone?.();
          return;
        }
      }
    }
    const chunks = uploadChunks(emails, mode);
    if (!chunks.length) { setError("לא נמצאו מיילים בקובץ."); return; }
    let added = 0, invalid = 0, failed = 0, members: number | null = null;
    try {
      for (let i = 0; i < chunks.length; i++) {
        setBusy(`שולח ${i + 1} מתוך ${chunks.length}…`);
        const r = await sendWithSplit(send, chunks[i]);
        added += r.added; invalid += r.invalid; failed += r.failed; members = r.members ?? members;
      }
      setDone(`הועלה. נוספו ${added}${invalid ? `, ${invalid} שורות לא תקינות` : ""}.${members !== null ? ` ברשימה עכשיו ${members} מיילים.` : ""}`);
      if (failed) setError(`${failed} מיילים לא נשמרו בגלל תקלה בחיבור. אפשר להעלות שוב את אותו קובץ במצב "הוספה" — מייל שכבר ברשימה לא נכפל.`);
    } catch {
      setError("ההעלאה נעצרה באמצע. אפשר להעלות שוב את אותו קובץ במצב \"הוספה\" — מייל שכבר ברשימה לא נכפל.");
    } finally { setBusy(null); onDone?.(); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">קובץ טקסט או CSV עם מייל בכל שורה. המיילים לא נשמרים כפי שהם, רק "טביעת אצבע" מוצפנת של כל אחד.</p>
      <Segmented className="max-w-md" value={mode} onChange={setMode} label="אופן ההעלאה" options={[{ id: "add", label: "הוספה לרשימה" }, { id: "replace", label: "החלפת הרשימה" }]} />
      <label className="flex items-center gap-3 flex-wrap text-sm">
        <span className="inline-flex items-center min-h-[44px] px-4 rounded-full border-2 border-paper-line bg-paper-card text-ink font-bold cursor-pointer hover:border-ink-faint focus-within:ring-2 focus-within:ring-ink">
          בחירת קובץ
          <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sr-only" />
        </span>
        <span className="text-ink-soft" dir="auto">{file ? file.name : "לא נבחר קובץ"}</span>
      </label>
      <Btn kind="primary" onClick={() => void upload()} disabled={!file || !!busy}>{busy ?? "העלאה"}</Btn>
      {done && <Notice>{done}</Notice>}
      {error && <Notice tone="warn">{error}</Notice>}
      {ask && (
        <ConfirmDialog
          title="להחליף את כל הרשימה?"
          confirm="כן, להחליף"
          onCancel={() => setAsk(null)}
          onConfirm={() => { const emails = ask; setAsk(null); void run(emails); }}
        >
          <p>{typeof current === "number" ? <>הרשימה הנוכחית (<strong>{current.toLocaleString("he-IL")}</strong> מיילים) תימחק</> : "הרשימה הנוכחית תימחק"} ותוחלף ב-<strong>{ask.length.toLocaleString("he-IL")}</strong> מיילים מהקובץ.</p>
          <p className="text-ink-soft">מי שלא מופיע בקובץ יוצא מהקבוצה. החשבונות והניחושים לא נמחקים.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
