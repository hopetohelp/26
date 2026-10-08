import { useState } from "react";
import { Btn, inputCls } from "./ui";
import { currentBackup, decodeBackup, encodeBackup, restoreBackup } from "./backup";

/** גיבוי ושחזור במכשיר — עובד גם כשהחיבור לשרת חסום */
export default function LocalBackup({ compact = false }: { compact?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const has = Object.keys(currentBackup()).length > 0;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(encodeBackup(currentBackup()));
      setMsg("הקוד הועתק. שמרו אותו במקום בטוח, למשל בהודעה לעצמכם.");
    } catch {
      setMsg("ההעתקה לא הצליחה. אפשר להוריד קובץ במקום.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`גיבוי ההשערה שלי לאתר ניתוח הבחירות לכנסת ה-26. כדי לשחזר: "הנתונים שלי" ← "שחזור מגיבוי", והדביקו את השורה הבאה.\n\n${encodeBackup(currentBackup())}\n`], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "גיבוי-ההשערה-שלי.txt" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg("הקובץ ירד.");
  };
  const restore = () => {
    const b = decodeBackup(code.slice(code.indexOf("E26:") < 0 ? 0 : code.indexOf("E26:")));
    if (!b) return setMsg("הקוד לא תקין. הדביקו את כל השורה שמתחילה ב-E26:");
    restoreBackup(b);
    setMsg("שוחזר. טוענים מחדש…");
    setTimeout(() => location.reload(), 600);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink">{compact ? "שמירה במכשיר, בלי שרת:" : "גיבוי במכשיר, בלי שרת. עובד גם כשהחיבור לשרת חסום. הקוד לא נכנס לממוצע הגולשים."}</p>
      <div className="flex gap-2 flex-wrap">
        <Btn onClick={download} disabled={!has}>הורדת גיבוי</Btn>
        <Btn onClick={copy} disabled={!has}>העתקת קוד</Btn>
      </div>
      {!compact && (
        <details>
          <summary className="cursor-pointer min-h-[44px] flex items-center font-bold text-sm">שחזור מגיבוי</summary>
          <div className="space-y-2 pb-2">
            <textarea aria-label="קוד הגיבוי" rows={3} dir="ltr" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="E26:…" />
            <Btn onClick={restore} disabled={!code.trim()}>שחזור</Btn>
            <p className="text-xs text-ink">השחזור מחליף את הטיוטה שבמכשיר הזה.</p>
          </div>
        </details>
      )}
      {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
    </div>
  );
}
