import { useState } from "react";
import { Segmented } from "./Choice";
import { Btn, Notice } from "../pages/guess/ui";
import type { GroupImportResult } from "../lib/crowdApi";
import { emailsFromText, sendWithSplit, uploadChunks } from "../lib/groupUpload";

/**
 * העלאת רשימת חברי קבוצה (docs/פילוח-קבוצות-תכנון.md): קובץ עם מייל בכל שורה, נשלח במנות. בשרת נשמר רק הגיבוב של כל מייל.
 * משמש את מנהל האתר (ממשק הניהול) ואת מנהל הקבוצה (האזור האישי). send = שליחת מנה אחת.
 */
export default function GroupUpload({ send, onDone }: { send: (chunk: { emails: string[]; mode: "add" | "replace" }) => Promise<GroupImportResult>; onDone?: () => void }) {
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setError(null); setDone(null);
    let text: string;
    try { text = await file.text(); } catch { setError("לא הצלחנו לקרוא את הקובץ. אפשר לשמור אותו מחדש כקובץ טקסט או CSV ולנסות שוב."); return; }
    const chunks = uploadChunks(emailsFromText(text), mode);
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
    </div>
  );
}
