import { useState } from "react";
import { shareUrl, type SharedGuess } from "../../lib/shareGuess";
import type { BlocTotal } from "./blocSummary";
import { isEmail } from "../../lib/identifier";
import { renderShareImage } from "./shareImage";
import { Btn } from "./ui";

const TEXT = "בניתי כנסת של 120 — השערה, לא סקר. ומה אתם מנחשים?";

/**
 * "שתפו את ההשערה" — כפתור אחד שפותח ישר את תפריט השיתוף של המכשיר (וואטסאפ, טלגרם…) עם תמונת ההשערה,
 * משפט קצר וקישור לאתר שמציג את ההשערה המלאה (?g=). בלי תפריט שיתוף במכשיר ⇐ וואטסאפ ישירות.
 * רק המספרים — ושם המשתמש, אם בחרתם לצרף אותו (ברירת מחדל: לא). בלי הקישור האישי ובלי שום פרט אחר.
 */
export default function Share({ values, pct, username, blocs }: { values: Record<string, number>; pct?: Record<string, number>; username?: string | null; blocs?: BlocTotal[]; open?: boolean }) {
  const [withName, setWithName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<"parties" | "blocs">(blocs?.length ? "blocs" : "parties");
  const imageKind = blocs?.length ? kind : "parties";
  const imageFile = async () => new File([await renderShareImage({ values, pct, username: withName && username ? username : undefined, blocs, kind: imageKind })], imageKind === "blocs" ? "הגושים-שלי.png" : "הכנסת-שלי.png", { type: "image/png" });
  const download = async () => {
    setBusy(true); setMsg(null);
    try {
      const file = await imageFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url; link.download = file.name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMsg("התמונה מוכנה. אפשר לצרף אותה להודעה.");
    } catch { setMsg("הכנת התמונה לא הצליחה. נסו שוב."); }
    finally { setBusy(false); }
  };

  const share = async () => {
    setMsg(null);
    setBusy(true);
    const name = withName && username ? username : undefined;
    const guess: SharedGuess = { seats: values, ...(pct ? { pct } : {}), ...(name ? { username: name } : {}) };
    const url = shareUrl(guess);
    try {
      if (navigator.share) {
        let file: File | null = null;
        try {
          file = await imageFile();
        } catch {
          file = null; // בלי תמונה — משתפים טקסט וקישור
        }
        const data: ShareData = { title: "ההשערה שלי לכנסת ה-26", text: TEXT, url };
        await navigator.share(file && navigator.canShare?.({ files: [file] }) ? { ...data, files: [file] } : data);
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${TEXT}\n${url}`)}`, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="font-bold text-sm">איזו תמונה לשתף?</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2 min-h-[44px]"><input type="radio" name="share-image-kind" checked={imageKind === "parties"} onChange={() => setKind("parties")} />מפלגות</label>
          <label className="flex items-center gap-2 min-h-[44px]"><input type="radio" name="share-image-kind" checked={imageKind === "blocs"} disabled={!blocs?.length} onChange={() => setKind("blocs")} />גושים</label>
        </div>
      </fieldset>
      <p className="text-xs text-ink-soft">{imageKind === "blocs" ? "רק הגושים: ההשערה שלי, ממוצע סקרים ותחזית לפי אותו הרכב מפלגות." : "המנדטים שלי לכל מפלגה, עם ממוצע הסקרים האחרון בקטן."}{!blocs?.length && " כדי לשתף גושים, הוסיפו להם מפלגות בלשונית לפי גושים."}</p>
      <Btn kind="primary" onClick={share} disabled={busy} className="w-full text-base">
        {busy ? "מכינים…" : "שתפו את ההשערה"}
      </Btn>
      <Btn onClick={download} disabled={busy} className="w-full">הורדת תמונה</Btn>
      {username && !isEmail(username) && (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="w-5 h-5" checked={withName} onChange={(e) => setWithName(e.target.checked)} />
          <span>
            לצרף את שם המשתמש שלי (<bdi className="font-bold">{username}</bdi>)
          </span>
        </label>
      )}
      {msg && (
        <p role="status" className="text-sm font-bold">
          {msg}
        </p>
      )}
    </div>
  );
}
