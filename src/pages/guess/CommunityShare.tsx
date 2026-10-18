import type { Selection } from "../../lib/dataResolver";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Dashboard } from "../../lib/crowdApi";
import { COMMUNITY_TEXT, COMMUNITY_URL, LONG_SHARE_TEXT, groupInviteImage, groupShareText, loadLogo, seatsImage, voteImage, type Brand } from "./communityShare";
import { Btn, FloatingPanel } from "./ui";

type Kind = "seats" | "vote" | "link" | "long" | "invite";
/** במסך קבוצה (הכרעת בעלים 12.10.2026): name = שם הקבוצה, url = קישור הקבוצה, logoUrl = תמונתה; dataReady = יש לקבוצה נתונים להצגה (מ-50 משתתפים) */
export interface GroupShareInfo { name: string; url: string; logoUrl: string | null; dataReady: boolean }
const OPTIONS: { id: Kind; label: string; hint: string }[] = [
  { id: "seats", label: "חלוקת המנדטים", hint: "תמונה מעוצבת: לוח 120 המושבים לפי ממוצע המשתתפים" },
  { id: "vote", label: "לאן הצביעו ויצביעו", hint: "תמונה מעוצבת: הצבעה ב-2022 מול הכוונה ב-2026" },
  { id: "link", label: "קישור", hint: "משפט קצר עם קישור לסקר האתר" },
  { id: "long", label: "נוסח ארוך", hint: "הודעה מלאה שמסבירה מה יש באתר, עם קישור" },
];
const GROUP_OPTIONS: { id: Kind; label: string; hint: string }[] = [
  { id: "invite", label: "תמונת הזמנה", hint: "תמונה מעוצבת עם לוגו הקבוצה, שמה וקישור — בלי נתונים" },
  { id: "seats", label: "חלוקת המנדטים", hint: "תמונה מעוצבת עם שם הקבוצה ולוגו: ממוצע חברי הקבוצה" },
  { id: "vote", label: "לאן הצביעו ויצביעו", hint: "תמונה מעוצבת עם שם הקבוצה ולוגו: הצבעה ב-2022 מול הכוונה ב-2026" },
  { id: "link", label: "קישור", hint: "משפט קצר עם קישור לסקר הקבוצה" },
];
const FILE: Record<Exclude<Kind, "link" | "long">, string> = { seats: "סקר-האתר-מנדטים.png", vote: "סקר-האתר-הצבעה.png", invite: "הזמנה-לסקר-הקבוצה.png" };

/**
 * שיתוף סקר האתר: שורת ההזמנה צפה בתחתית עם ריווח מדוד; אין כפתור שיתוף כפול. גם במסך קבוצה (group) הפס צף בתחתית, והאפשרויות כוללות תמונת הזמנה עם שם הקבוצה ולוגו.
 */
export default function CommunityShare({ d, group, selection = { product: "polls.mean" } }: { d: Dashboard; group?: GroupShareInfo; selection?: Selection }) {
  const [open, setOpen] = useState(false);
  const banner = (
    <section aria-label={group ? `שיתוף ${group.name}` : "שיתוף סקר האתר"} className="c-share-banner rounded-theme border border-paper-line bg-accent-soft p-4 flex flex-wrap items-center justify-between gap-3">
      {group
        ? <p className="font-display text-xl leading-tight">הוסיפו את ההשערה שלכם ל{group.name} <span className="text-signal">הצטרפו!</span> <span className="block text-sm font-body text-ink-soft mt-1">שתפו את הקבוצה עם חברים והרחיבו את מעגל המשתתפים.</span></p>
        : <div>
      <p className="font-display text-xl leading-tight">עוד נקודות מבט על הבחירות <span className="block text-sm font-body text-ink-soft mt-1">שתפו את האתר עם חברים והרחיבו את מעגל המשתתפים.</span></p>
      </div>}
      <Btn kind="primary" onClick={() => setOpen(true)} className="shrink-0">שיתוף</Btn>
    </section>
  );
  return (
    <>
      <FloatingPanel className="c-community-share">{banner}</FloatingPanel>
      {open && <ShareDialog d={d} group={group} selection={selection} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ d, group, onClose, selection }: { d: Dashboard; group?: GroupShareInfo; selection: Selection; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<Kind>(group ? "invite" : "seats");
  const logo = useRef<Promise<Brand["logo"]> | null>(null);
  const options = group ? GROUP_OPTIONS : OPTIONS;
  const text = group ? groupShareText(group.name) : COMMUNITY_TEXT;
  const url = group ? group.url : COMMUNITY_URL;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => back?.focus();
  }, []);
  const hasSeats = !!d.seats?.full.length;
  const hasVote = !!(d.vote2022 || d.vote2026);
  const noData = !!group && !group.dataReady;
  const disabled = (k: Kind) => (k === "seats" && (!hasSeats || noData)) || (k === "vote" && (!hasVote || noData));

  const makeFile = async (k: Exclude<Kind, "link" | "long">) => {
    let brand: Brand | undefined;
    if (group) { logo.current ??= loadLogo(group.logoUrl); brand = { name: group.name, url: group.url, logo: await logo.current }; }
    const blob = k === "invite" ? await groupInviteImage(brand!) : k === "seats" ? await seatsImage(d, brand, selection) : await voteImage(d, brand);
    return new File([blob], FILE[k], { type: "image/png" });
  };
  const share = async () => {
    setBusy(true); setMsg(null);
    const textOnly = kind === "link" || kind === "long";
    // בנוסח הארוך הקישור כבר בתוך הטקסט, ולכן אין url נפרד
    const body = kind === "long" ? LONG_SHARE_TEXT : `${text}\n${url}`;
    const data: ShareData = kind === "long" ? { title: "בחירות 2026", text: LONG_SHARE_TEXT } : { title: group ? `${group.name} — הבחירות לכנסת ה-26` : "סקר האתר — הבחירות לכנסת ה-26", text, url };
    try {
      if (textOnly && !navigator.share && navigator.clipboard) {
        await navigator.clipboard.writeText(body);
        setMsg(kind === "long" ? "ההודעה הועתקה. אפשר להדביק בכל הודעה." : "המשפט והקישור הועתקו. אפשר להדביק בכל הודעה.");
      } else if (navigator.share) {
        let file: File | null = null;
        if (!textOnly) try { file = await makeFile(kind); } catch { file = null; }
        await navigator.share(file && navigator.canShare?.({ files: [file] }) ? { ...data, files: [file] } : data);
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. נסו שוב.");
    } finally { setBusy(false); }
  };
  const download = async () => {
    if (kind === "link" || kind === "long") return;
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
          <h2 id="community-share-title" className="text-2xl font-display leading-tight">{group ? `שיתוף ${group.name}` : "שיתוף סקר האתר"}</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="w-11 h-11 -mt-2 -me-2 rounded-full text-2xl leading-none text-ink-soft hover:text-ink">×</button>
        </div>
        <fieldset className="space-y-2">
          <legend className="font-bold text-sm mb-2">מה לשתף? בכל אפשרות מצורף קישור {group ? "לקבוצה" : "לאתר"}.</legend>
          {options.map((o) => (
            <label key={o.id} className={`flex items-start gap-3 min-h-[44px] rounded-theme border-2 p-3 cursor-pointer ${kind === o.id ? "border-ink" : "border-paper-line"} ${disabled(o.id) ? "opacity-50 cursor-not-allowed" : ""}`}>
              <input type="radio" name="community-share-kind" className="mt-1 accent-current" checked={kind === o.id} disabled={busy || disabled(o.id)} onChange={() => setKind(o.id)} />
              <span><span className="font-bold block">{o.label}</span><span className="text-xs text-ink-soft">{disabled(o.id) ? (noData ? "נתוני הקבוצה יוצגו מ-50 משתתפים" : "עדיין אין נתונים להצגה") : o.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <Btn kind="primary" onClick={share} disabled={busy} className="w-full text-base">{busy ? "מכינים…" : "שתפו"}</Btn>
        {kind !== "link" && kind !== "long" && <Btn onClick={download} disabled={busy} className="w-full">הורדת תמונה</Btn>}
        {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
      </div>
    </div>, document.body);
}
