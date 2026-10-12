import { useEffect, useState, type FormEvent } from "react";
import { Btn, Field, Notice, inputCls } from "../pages/guess/ui";
import type { GroupImportResult, GroupLinkStats } from "../lib/crowdApi";
import { cleanSlugInput, finalSlug, groupImageUrl, groupUrl, imageToDataUrl } from "../lib/groupLink";

/**
 * כלי הקבוצה (docs/פילוח-קבוצות-תכנון.md, סעיף 10) — אותם רכיבים למנהל האתר (ממשק הניהול) ולמנהל הקבוצה (האזור האישי);
 * ההבדל רק בפונקציות הקריאה לשרת שהם מקבלים. הכול מהטוקנים, בלי צבע קבוע.
 */
const problem = (e: unknown) => {
  const code = (e as { code?: string }).code;
  const text = (e as Error).message ?? "";
  if (code === "slug_taken" || /\(409\)/.test(text)) return "השם הזה כבר תפוס בקבוצה אחרת. בחרו שם אחר.";
  if (code === "slug") return "השם צריך להיות באנגלית: 3 עד 32 תווים, אותיות, ספרות ומקף.";
  if (code === "image" || code === "too_large") return "התמונה לא התקבלה. אפשר JPG, PNG או WebP, והיא מוקטנת אוטומטית.";
  return "הפעולה לא הצליחה. נסו שוב.";
};

const tile = "bg-paper-card border border-paper-line rounded-theme p-3";

/** הקישור של הקבוצה: שם באנגלית, כפתור העתקה ומספר הכניסות דרכו. בלי שם — רק שדה לקביעתו */
export function GroupLinkPanel({ slug, setSlug, loadStats }: { slug: string | null | undefined; setSlug: (slug: string | null) => Promise<void>; loadStats: () => Promise<GroupLinkStats> }) {
  const [text, setText] = useState(slug ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<GroupLinkStats | null>(null);
  const url = slug ? groupUrl(slug) : null;
  useEffect(() => { setText(slug ?? ""); }, [slug]);
  useEffect(() => {
    if (!slug) { setStats(null); return; }
    let live = true;
    loadStats().then((s) => { if (live) setStats(s); }, () => { if (live) setStats(null); });
    return () => { live = false; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const next = finalSlug(text);
    if (!next) { setMsg({ ok: false, text: problem({ code: "slug" }) }); return; }
    setBusy(true); setMsg(null);
    try { await setSlug(next); setMsg({ ok: true, text: "שם הקישור נשמר." }); } catch (err) { setMsg({ ok: false, text: problem(err) }); } finally { setBusy(false); }
  };
  const auto = async () => {
    setBusy(true); setMsg(null);
    try { await setSlug(null); setMsg({ ok: true, text: "הקישור נוצר. אפשר לשנות את השם בכל עת." }); } catch (err) { setMsg({ ok: false, text: problem(err) }); } finally { setBusy(false); }
  };
  const copy = () => {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }, () => setMsg({ ok: false, text: "ההעתקה לא הצליחה. סמנו את הקישור והעתיקו ידנית." }));
  };
  const nameForm = (
    <form onSubmit={(e) => void save(e)} className="space-y-2">
      <Field label={slug ? "שם הקבוצה באנגלית (לקישור)" : "או שם משלכם באנגלית"} hint="אותיות באנגלית, ספרות ומקף, לפחות 3 תווים. למשל: the-gizra. שינוי השם מבטל קישורים שכבר נשלחו.">
        <input dir="ltr" className={inputCls} value={text} onChange={(e) => setText(cleanSlugInput(e.target.value))} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </Field>
      <Btn type="submit" kind={slug ? "ghost" : "primary"} disabled={busy || !finalSlug(text) || finalSlug(text) === slug}>{slug ? "שמירת השם החדש" : "יצירת הקישור"}</Btn>
    </form>
  );
  return (
    <div className="space-y-3">
      <p className="font-bold text-sm">קישור הקבוצה</p>
      {url ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly dir="ltr" aria-label="קישור הקבוצה" value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} flex-1 min-w-[12rem]`} />
            <Btn kind="primary" onClick={copy} aria-label={copied ? "הקישור הועתק" : "העתקת הקישור"}>{copied ? "הועתק" : "העתקה"}</Btn>
          </div>
          <p className="text-sm font-bold pt-1">כניסות דרך הקישור</p>
          {stats ? (
            <div className="grid grid-cols-3 gap-3">
              {([["בסך הכול", stats.opens], ["היום", stats.today], ["דפדפנים שונים", stats.fresh]] as const).map(([label, n]) => (
                <div key={label} className={tile}>
                  <p className="text-xs text-ink-soft">{label}</p>
                  <p className="font-num tabular text-3xl leading-none mt-1">{n.toLocaleString("he-IL")}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-ink-soft">המספרים אינם זמינים כרגע.</p>}
          <details className="[&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none text-sm underline min-h-[44px] inline-flex items-center">שינוי שם הקישור</summary>
            <div className="pt-2">{nameForm}</div>
          </details>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-soft">אין עדיין קישור לקבוצה. אפשר ליצור אותו אוטומטית משם הקבוצה בעברית (תעתיק לאנגלית), או לכתוב שם בעצמכם.</p>
          <Btn kind="primary" disabled={busy} onClick={() => void auto()}>יצירת קישור אוטומטית</Btn>
          {nameForm}
        </>
      )}
      {msg && <Notice tone={msg.ok ? "calm" : "warn"}>{msg.text}</Notice>}
    </div>
  );
}

/** תמונת הקבוצה: תופיעה בראש סקר האתר כשהוא פתוח על הקבוצה. נבחרת, מוקטנת בדפדפן ונשמרת מיד */
export function GroupImagePanel({ id, image, setImage }: { id: string; image: string | null | undefined; setImage: (dataUrl: string | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const src = groupImageUrl({ id }, image);
  const run = async (f: () => Promise<void>, done: string) => {
    setBusy(true); setMsg(null);
    try { await f(); setMsg({ ok: true, text: done }); } catch (err) { setMsg({ ok: false, text: problem(err) }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <p className="font-bold text-sm">תמונת הקבוצה</p>
      <p className="text-sm text-ink-soft">מוצגת בראש סקר האתר כשהוא פתוח על הקבוצה. התמונה מוקטנת אוטומטית.</p>
      {src && <img src={src} alt="" className="max-h-32 rounded-theme border border-paper-line bg-paper object-contain" />}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`inline-flex items-center min-h-[44px] px-4 rounded-full border-2 border-paper-line bg-paper-card text-ink text-sm font-bold cursor-pointer hover:border-ink-faint focus-within:ring-2 focus-within:ring-ink ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          {busy ? "שולח…" : src ? "החלפת תמונה" : "בחירת תמונה"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void run(async () => setImage(await imageToDataUrl(file)), "התמונה נשמרה.");
            }} />
        </label>
        {src && <Btn kind="danger" disabled={busy} onClick={() => void run(() => setImage(null), "התמונה הוסרה.")}>הסרת התמונה</Btn>}
      </div>
      {msg && <Notice tone={msg.ok ? "calm" : "warn"}>{msg.text}</Notice>}
    </div>
  );
}

/** הוספת כתובת מייל בודדת לרשימת הקבוצה, בלי קובץ */
export function GroupAddEmail({ add, onDone }: { add: (email: string) => Promise<GroupImportResult>; onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await add(email.trim());
      if (r.invalid) setMsg({ ok: false, text: "כתובת המייל אינה תקינה." });
      else if (r.added) { setMsg({ ok: true, text: `נוסף לרשימה. ברשימה עכשיו ${r.members.toLocaleString("he-IL")} מיילים.` }); setEmail(""); onDone?.(); }
      else setMsg({ ok: true, text: "המייל כבר ברשימה." });
    } catch { setMsg({ ok: false, text: "ההוספה לא הצליחה. נסו שוב." }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2">
      <Field label="הוספת מייל בודד" hint="כתובת אחת בכל פעם. חבר שכבר רשום באתר עם המייל הזה מצטרף לקבוצה מיד.">
        <input dir="ltr" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </Field>
      <Btn type="submit" disabled={busy || !email.includes("@")}>{busy ? "מוסיף…" : "הוספה"}</Btn>
      {msg && <Notice tone={msg.ok ? "calm" : "warn"}>{msg.text}</Notice>}
    </form>
  );
}
