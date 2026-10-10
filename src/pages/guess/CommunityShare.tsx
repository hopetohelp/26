import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Dashboard } from "../../lib/crowdApi";
import { COMMUNITY_TEXT, COMMUNITY_URL, seatsImage, voteImage } from "./communityShare";
import { Btn } from "./ui";

type Kind = "seats" | "vote" | "link";
const OPTIONS: { id: Kind; label: string; hint: string }[] = [
  { id: "seats", label: "חלוקת המנדטים", hint: "תמונה מעוצבת: לוח 120 המושבים לפי ממוצע המשתתפים" },
  { id: "vote", label: "לאן הצביעו ויצביעו", hint: "תמונה מעוצבת: הצבעה ב-2022 מול הכוונה ב-2026" },
  { id: "link", label: "קישור", hint: "משפט קצר עם קישור לסקר האתר" },
];
const FILE: Record<Exclude<Kind, "link">, string> = { seats: "סקר-האתר-מנדטים.png", vote: "סקר-האתר-הצבעה.png" };

/**
 * שיתוף סקר האתר (הכרעת בעלים 10.10.2026): פס עליון שמזמין לשתף, כפתור צף בפינה השמאלית התחתונה,
 * ושניהם פותחים חלון עם שלוש אפשרויות — בכולן קישור לאתר.
 */
export default function CommunityShare({ d }: { d: Dashboard }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("community-share")), []);
  const banner = (
    <section aria-label="שיתוף סקר האתר" className="mb-5 rounded-theme border-2 border-ink bg-paper-card p-4 flex flex-wrap items-center justify-between gap-3">
      <p className="font-display text-xl leading-tight">רוצים שהסקר יהיה מדויק יותר? <span className="text-signal">זה תלוי בכם!</span> <span className="block text-sm font-body text-ink-soft mt-1">שתפו את האתר עם חברים — כל משתתף נוסף מחדד את התמונה.</span></p>
      <Btn kind="primary" onClick={() => setOpen(true)} className="shrink-0">שיתוף</Btn>
    </section>
  );
  return (
    <>
      {slot ? createPortal(banner, slot) : banner}
      {createPortal(
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
          className="fixed z-30 left-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 min-h-[48px] px-5 rounded-full bg-signal text-signal-ink font-bold shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
          שיתוף
        </button>, document.body)}
      {open && <ShareDialog d={d} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ d, onClose }: { d: Dashboard; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<Kind>("seats");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => back?.focus();
  }, []);
  const hasSeats = !!d.seats?.full.length;
  const hasVote = !!(d.vote2022 || d.vote2026);
  const disabled = (k: Kind) => (k === "seats" && !hasSeats) || (k === "vote" && !hasVote);

  const makeFile = async (k: Exclude<Kind, "link">) => {
    const blob = k === "seats" ? await seatsImage(d) : await voteImage(d);
    return new File([blob], FILE[k], { type: "image/png" });
  };
  const share = async () => {
    setBusy(true); setMsg(null);
    const data: ShareData = { title: "סקר האתר — הבחירות לכנסת ה-26", text: COMMUNITY_TEXT, url: COMMUNITY_URL };
    try {
      if (kind === "link" && !navigator.share && navigator.clipboard) {
        await navigator.clipboard.writeText(`${COMMUNITY_TEXT}\n${COMMUNITY_URL}`);
        setMsg("המשפט והקישור הועתקו. אפשר להדביק בכל הודעה.");
      } else if (navigator.share) {
        let file: File | null = null;
        if (kind !== "link") try { file = await makeFile(kind); } catch { file = null; }
        await navigator.share(file && navigator.canShare?.({ files: [file] }) ? { ...data, files: [file] } : data);
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${COMMUNITY_TEXT}\n${COMMUNITY_URL}`)}`, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. נסו שוב.");
    } finally { setBusy(false); }
  };
  const download = async () => {
    if (kind === "link") return;
    setBusy(true); setMsg(null);
    try {
      const file = await makeFile(kind);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMsg("התמונה מוכנה. צרפו אותה להודעה יחד עם הקישור.");
    } catch { setMsg("הכנת התמונה לא הצליחה. נסו שוב."); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="community-share-title" className="bg-paper-card text-ink w-full md:max-w-md rounded-t-theme md:rounded-theme p-5 space-y-4 max-h-[92vh] overflow-y-auto focus:outline-none">
        <div className="flex items-start justify-between gap-2">
          <h2 id="community-share-title" className="text-2xl font-display leading-tight">שיתוף סקר האתר</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="w-11 h-11 -mt-2 -me-2 rounded-full text-2xl leading-none text-ink-soft hover:text-ink">×</button>
        </div>
        <fieldset className="space-y-2">
          <legend className="font-bold text-sm mb-2">מה לשתף? בכל אפשרות מצורף קישור לאתר.</legend>
          {OPTIONS.map((o) => (
            <label key={o.id} className={`flex items-start gap-3 min-h-[44px] rounded-theme border-2 p-3 cursor-pointer ${kind === o.id ? "border-ink" : "border-paper-line"} ${disabled(o.id) ? "opacity-50 cursor-not-allowed" : ""}`}>
              <input type="radio" name="community-share-kind" className="mt-1 accent-current" checked={kind === o.id} disabled={busy || disabled(o.id)} onChange={() => setKind(o.id)} />
              <span><span className="font-bold block">{o.label}</span><span className="text-xs text-ink-soft">{disabled(o.id) ? "עדיין אין נתונים להצגה" : o.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <Btn kind="primary" onClick={share} disabled={busy} className="w-full text-base">{busy ? "מכינים…" : "שתפו"}</Btn>
        {kind !== "link" && <Btn onClick={download} disabled={busy} className="w-full">הורדת תמונה</Btn>}
        {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
      </div>
    </div>, document.body);
}
