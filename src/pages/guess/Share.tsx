import { useEffect, useState } from "react";
import { shareUrl, type SharedGuess } from "../../lib/shareGuess";
import { renderShareImage } from "./shareImage";
import { Btn } from "./ui";

const TEXT = "בניתי כנסת של 120 — השערה, לא סקר. ומה אתם מנחשים?";

/**
 * "שתפו את ההשערה": קישור שמציג את ההשערה המלאה למי שפותח אותו (?g=), תמונה, העתקה ווואטסאפ.
 * רק המספרים — ושם המשתמש, אם בחרתם לצרף אותו (ברירת מחדל: לא). בלי הקישור האישי ובלי שום פרט אחר.
 */
export default function Share({ values, pct, username, open: openInit = false }: { values: Record<string, number>; pct?: Record<string, number>; username?: string | null; open?: boolean }) {
  const [open, setOpen] = useState(openInit);
  const [withName, setWithName] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const guess: SharedGuess = { seats: values, ...(pct ? { pct } : {}), ...(withName && username ? { username } : {}) };
  const link = shareUrl(guess);
  const key = JSON.stringify(guess);

  useEffect(() => setOpen((o) => o || openInit), [openInit]);
  // התמונה נבנית מחדש כשההשערה משתנה
  useEffect(() => {
    setImg((old) => (old && URL.revokeObjectURL(old.url), null));
  }, [key]);
  useEffect(() => (img ? () => URL.revokeObjectURL(img.url) : undefined), [img]);

  const makeImage = async () => {
    if (img) return img;
    setBusy(true);
    try {
      const blob = await renderShareImage({ values, pct, username: withName && username ? username : undefined });
      const v = { blob, url: URL.createObjectURL(blob) };
      setImg(v);
      return v;
    } finally {
      setBusy(false);
    }
  };
  const shareImage = async () => {
    setMsg(null);
    try {
      const { blob, url } = await makeImage();
      const file = new File([blob], "הכנסת-שלי.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "ההשערה שלי לכנסת ה-26", text: `${TEXT}\n${link}` });
        setMsg("שותף.");
      } else {
        const a = Object.assign(document.createElement("a"), { href: url, download: "הכנסת-שלי.png" });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setMsg("התמונה ירדה. אפשר לצרף אותה לכל הודעה, יחד עם הקישור.");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("לא הצלחנו ליצור את התמונה. הקישור עדיין עובד.");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${TEXT}\n${link}`);
      setMsg("הקישור הועתק.");
    } catch {
      setMsg("ההעתקה לא הצליחה. סמנו את הקישור בתיבה והעתיקו ביד.");
    }
  };

  if (!open) {
    return (
      <Btn kind="primary" onClick={() => setOpen(true)} className="w-full text-base">
        שתפו את ההשערה
      </Btn>
    );
  }
  return (
    <section className="border-2 border-ink rounded-theme p-4 bg-paper-card space-y-3" aria-labelledby="share-title">
      <h3 id="share-title" className="font-display text-3xl leading-none">
        שתפו את ההשערה
      </h3>
      <p className="text-sm text-ink-soft">מי שיפתח את הקישור יראה את הכנסת שלכם — ויוכל לבנות את שלו. משתפים רק את המספרים.</p>
      {username && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 w-5 h-5" checked={withName} onChange={(e) => setWithName(e.target.checked)} />
          <span>
            לצרף את שם המשתמש שלי (<bdi className="font-bold">{username}</bdi>)
          </span>
        </label>
      )}
      <div className="flex gap-2 flex-wrap">
        <Btn kind="primary" onClick={shareImage} disabled={busy}>
          {busy ? "יוצר תמונה…" : "שיתוף כתמונה"}
        </Btn>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${TEXT}\n${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] px-4 rounded-full border-2 text-sm font-bold bg-paper-card text-ink border-paper-line hover:border-ink-faint inline-flex items-center"
        >
          וואטסאפ
        </a>
        <Btn onClick={copy}>העתקת קישור</Btn>
        {!img && (
          <Btn onClick={() => void makeImage()} disabled={busy}>
            תצוגה מקדימה
          </Btn>
        )}
      </div>
      <input readOnly aria-label="קישור השיתוף" value={link} dir="ltr" className="w-full min-h-[44px] rounded-theme border border-paper-line bg-paper text-ink px-3 text-xs" onFocus={(e) => e.target.select()} />
      {img && <img src={img.url} alt="תמונת השיתוף: חצי עיגול של 120 מושבים והרשימות לפי ההשערה" className="w-full max-w-[18rem] rounded-theme border border-paper-line" />}
      {msg && (
        <p role="status" className="text-sm font-bold">
          {msg}
        </p>
      )}
    </section>
  );
}
