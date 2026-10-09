import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shareUrl, type SharedGuess } from "../../lib/shareGuess";
import type { BlocTotal } from "./blocSummary";
import { isEmail } from "../../lib/identifier";
import { renderShareImage } from "./shareImage";
import { Btn } from "./ui";

const TEXT = "בניתי כנסת של 120 — השערה, לא סקר. ומה אתם מנחשים?";

/**
 * כפתור צף "שתף / הורד" מעל תמונת הכנסת פותח חלון עם בחירת התמונה, צירוף השם, שיתוף והורדה. השיתוף פותח ישר את תפריט השיתוף של המכשיר (וואטסאפ, טלגרם…) עם תמונת ההשערה,
 * משפט קצר וקישור לאתר שמציג את ההשערה המלאה (?g=). בלי תפריט שיתוף במכשיר ⇐ וואטסאפ ישירות.
 * רק המספרים — ושם המשתמש, אם בחרתם לצרף אותו (ברירת מחדל: לא). בלי הקישור האישי ובלי שום פרט אחר.
 */
export default function Share({ values, pct, username, blocs }: { values: Record<string, number>; pct?: Record<string, number>; username?: string | null; blocs?: BlocTotal[]; open?: boolean }) {
  const [withName, setWithName] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => back?.focus();
  }, [open]);
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

  const pill = (on: boolean) => `flex-1 min-h-[44px] px-4 rounded-full border-2 text-sm font-bold ${on ? "bg-ink text-paper-card border-ink" : "bg-paper-card text-ink border-paper-line hover:border-ink-faint"} disabled:opacity-40`;
  return (
    <>
      <button type="button" data-share-open onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className="absolute top-2 start-2 z-10 min-h-[44px] px-4 rounded-full border-2 border-ink bg-paper-card text-ink text-sm font-bold shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
        שתף / הורד
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center" onClick={(e) => e.target === e.currentTarget && setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="share-title" className="bg-paper-card text-ink w-full md:max-w-md rounded-t-theme md:rounded-theme p-5 space-y-4 max-h-[92vh] overflow-y-auto focus:outline-none">
            <div className="flex items-start justify-between gap-2">
              <h2 id="share-title" className="text-2xl font-display leading-tight">שיתוף ההשערה</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="w-11 h-11 -mt-2 -me-2 rounded-full text-2xl leading-none text-ink-soft hover:text-ink">×</button>
            </div>
            <div role="radiogroup" aria-label="איזו תמונה לשתף?" className="space-y-2">
              <p className="font-bold text-sm">איזו תמונה?</p>
              <div className="flex gap-2">
                <button type="button" role="radio" aria-checked={imageKind === "parties"} disabled={busy} onClick={() => setKind("parties")} className={pill(imageKind === "parties")}>מפלגות</button>
                <button type="button" role="radio" aria-checked={imageKind === "blocs"} disabled={busy || !blocs?.length} onClick={() => setKind("blocs")} className={pill(imageKind === "blocs")}>גושים</button>
              </div>
              <p className="text-xs text-ink-soft">{imageKind === "blocs" ? "רק הגושים: ההשערה שלי, ממוצע סקרים ותחזית לפי אותו הרכב מפלגות." : "המנדטים שלי לכל מפלגה, עם ממוצע הסקרים האחרון בקטן."}{!blocs?.length && " כדי לשתף גושים, הוסיפו להם מפלגות בלשונית לפי גושים."}</p>
            </div>
            {username && !isEmail(username) && (
              <button type="button" role="switch" aria-checked={withName} onClick={() => setWithName(!withName)} className="w-full flex items-center justify-between gap-3 min-h-[44px] text-sm text-start">
                <span>לצרף את שם המשתמש שלי (<bdi className="font-bold">{username}</bdi>)</span>
                <span aria-hidden="true" className={`shrink-0 w-12 h-7 rounded-full border-2 border-ink p-0.5 flex ${withName ? "bg-ink justify-end" : "bg-paper-card justify-start"}`}>
                  <span className={`w-5 h-5 rounded-full ${withName ? "bg-paper-card" : "bg-ink"}`} />
                </span>
              </button>
            )}
            <Btn kind="primary" onClick={share} disabled={busy} className="w-full text-base">{busy ? "מכינים…" : "שתפו את ההשערה"}</Btn>
            <Btn onClick={download} disabled={busy} className="w-full">הורדת תמונה</Btn>
            {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
          </div>
        </div>, document.body)}
    </>
  );
}
