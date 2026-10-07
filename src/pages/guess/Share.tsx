import { useState } from "react";
import { shareUrl, type SharedGuess } from "../../lib/shareGuess";
import type { BlocTotal } from "./blocSummary";
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
          file = new File([await renderShareImage({ values, pct, username: name, blocs })], "הכנסת-שלי.png", { type: "image/png" });
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
      <Btn kind="primary" onClick={share} disabled={busy} className="w-full text-base">
        {busy ? "מכינים…" : "שתפו את ההשערה"}
      </Btn>
      {username && (
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
