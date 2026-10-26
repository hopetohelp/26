import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import { PARTY_IMAGES } from "../../lib/partyImages";
import { SITE_URL } from "../../lib/shareGuess";
import { groupUrl } from "../../lib/groupLink";
import { SIMPLE_BLOCS, simpleSelection, simpleValue } from "../../lib/simpleSources";
import { crowdDashboardOnce } from "../../lib/sources";
import { getToken } from "../../lib/crowdSession";
import { reportVideo } from "../../lib/visits";
import { BLOC_COLORS, type PromoData, type PromoList } from "../../lib/promoVideo";
import type { PromoFile } from "../../lib/promoEncode";
import { nameOf } from "../guess/model";
import { blocSlices, orderedLists } from "./shared";
import type { Dashboard } from "../../lib/crowdApi";

/** סדר הגושים בעוגה — כמו העוגה באתר */
const RING = ["netanyahu", "eisenkot", "arab", "haredi"];
/** יעד המונה: 3,000 (הכרעת בעלים), וכשעוברים אותו — היעד העגול הבא, כך שהסרטון מתאים לכל כמות בלי שינוי */
export const nextGoal = (n: number) => [3000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000].find(g => g > n) ?? Math.ceil((n + 1) / 1e6) * 1e6;
const loadImg = (src: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
/** תאריך כמו בכל האתר: יום/חודש (siteRules) */
const day = (iso?: string) => { const d = iso ? new Date(iso) : new Date(); return `${d.getDate()}/${d.getMonth() + 1}`; };

/**
 * נתוני הסרטון — מאותן פונקציות של המסכים (מקור אמת אחד): ממוצע הסקרים של האתר (simpleValue), ממוצע הניחושים מלוח המשתתפים,
 * סדר הרשימות של הגרף (orderedLists), הגושים והשלמים שלהם (blocSlices), ומספר הניחושים המלאים ברגע היצירה.
 */
/** שם המנחש לסרטון: עד שתי מילים, בלי רווחים כפולים; ריק ⇐ "הניחוש שלי" */
export const guesserName = (raw: string) => raw.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ").slice(0, 30);
const isFull = (g?: Record<string, number> | null) => !!g && Math.abs(Object.values(g).reduce((a, b) => a + (b || 0), 0) - 120) < .5;

export async function buildPromoData(dash: Dashboard, group: { slug: string; logoUrl: string | null } | null, myGuess?: Record<string, number> | null, name = ""): Promise<PromoData> {
  // הניחוש שלי — עוגה שלישית, רק כשהוא מלא (120)
  const mine = isFull(myGuess) ? myGuess! : null, who = guesserName(name);
  const selection = simpleSelection("all");
  const crowd: Record<string, number> = Object.fromEntries((dash.seats?.full ?? []).map(r => [r.list, r.mean]));
  const polls = (id: string) => simpleValue(selection, [id]) ?? 0;
  const ids = orderedLists(selection, [], crowd);
  const lists: PromoList[] = await Promise.all(ids.map(async id => ({ id, name: nameOf(id), polls: polls(id), crowd: crowd[id] ?? 0, ...(mine ? { mine: mine[id] ?? 0 } : {}), img: PARTY_IMAGES[id] ? await loadImg(`${import.meta.env.BASE_URL}${PARTY_IMAGES[id].file}`) : null })));
  const pollValues = Object.fromEntries(ids.map(id => [id, polls(id)]));
  const sp = blocSlices(pollValues), sc = blocSlices(crowd), sm = mine ? blocSlices(mine) : null;
  const blocs = RING.map(id => {
    const p = sp.find(s => s.id === id), c = sc.find(s => s.id === id), m = sm?.find(s => s.id === id);
    const my = sm ? { mine: m?.value ?? 0 } : {};
    return { id, short: SIMPLE_BLOCS.find(b => b.id === id)?.short ?? id, polls: p?.value ?? 0, crowd: c?.value ?? 0, ...my, shown: { polls: p?.shown ?? 0, crowd: c?.shown ?? 0, ...(sm ? { mine: m?.shown ?? 0 } : {}) }, color: BLOC_COLORS[id] };
  });
  const haredi = lists.filter(l => SIMPLE_BLOCS[1].lists.includes(l.id) && (l.polls >= .5 || l.crowd >= .5 || (l.mine ?? 0) >= .5));
  const gap = [...lists].sort((a, b) => Math.abs(b.crowd - b.polls) - Math.abs(a.crowd - a.polls))[0];
  const link = group ? groupUrl(group.slug) : SITE_URL, q = qrcode(0, "M");
  q.addData(link); q.make();
  const m = q.getModuleCount(), qr = Array.from({ length: m }, (_, r) => Array.from({ length: m }, (_, k) => q.isDark(r, k)));
  // סמל הגזרה — קובץ קבוע באתר (הכרעת בעלים 26.10.2026): בלי פנייה לשרת המשתתפים
  const logo = await loadImg(`${import.meta.env.BASE_URL}promo/hagzara.jpg`);
  return { ...(mine && who ? { mineLabel: `הניחוש של ${who}` } : {}), asOf: day(dash.publishedAt ?? undefined), lists, blocs, haredi, gap, guesses: dash.seats?.n ?? 0, goal: nextGoal(dash.seats?.n ?? 0), host: SITE_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, ""), logo, qr };
}

/** "צור סרטון" בחלון השיתוף: הסרטון נבנה בדפדפן מהנתונים של הרגע הזה — בלי AI, בלי שרת ובלי עלות */
export default function PromoVideo({ group, mine }: { group: { slug: string; logoUrl: string | null } | null; mine?: Record<string, number> | null }) {
  const [state, setState] = useState<"idle" | "options" | "busy" | "done" | "failed" | "nodata">("idle");
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<PromoFile | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // העוגה האישית — רק באישור מפורש (תיבת סימון), ושם רק אם נכתב
  const [withMine, setWithMine] = useState(false);
  const [name, setName] = useState("");
  const canMine = isFull(mine);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const make = async () => {
    setState("busy"); setProgress(0); setMsg(null);
    try {
      // נתוני המשתתפים רק בלחיצה — בלי רענון קבוע כשהחלון פתוח
      const dash = await crowdDashboardOnce();
      if (!dash) { setState("nodata"); return; }
      const [{ renderPromoVideo }, data] = await Promise.all([import("../../lib/promoEncode"), buildPromoData(dash, group, withMine && canMine ? mine : null, withMine ? name : "")]);
      const f = await renderPromoVideo(data, setProgress);
      setFile(f); setUrl(URL.createObjectURL(f.blob)); setState("done");
      const withGuess = withMine && canMine;
      reportVideo({ mine: withGuess, named: withGuess && !!guesserName(name) }, getToken());
    } catch { setState("failed"); }
  };
  const share = async () => {
    if (!file) return;
    setMsg(null);
    const f = new File([file.blob], file.name, { type: file.type });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f] });
      else save();
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. אפשר לשמור את הסרטון ולשתף אותו."); }
  };
  const save = () => {
    if (!url || !file) return;
    const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  };
  if (state === "done" && url) return <div className="grid gap-2">
    <video src={url} controls playsInline className="w-full rounded-[14px] border border-paper-line" style={{ aspectRatio: "9 / 16", maxHeight: "60vh", background: "#05070d" }} />
    <div className="flex gap-2"><button type="button" className="f-btn pri flex-1" onClick={share}>שיתוף הסרטון</button><button type="button" className="f-btn flex-1" onClick={save}>שמירת הסרטון</button></div>
    {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
  </div>;
  // "צור סרטון" ⇐ (למי שיש ניחוש מלא) סימון "להוסיף את הניחוש שלי" ⇐ הסימון פותח את שדה השם ⇐ "יצירת הסרטון"
  const options = state === "options";
  return <div className="grid gap-1">
    {options && <div className="grid gap-2 mb-1">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withMine} onChange={e => setWithMine(e.target.checked)} />להוסיף לסרטון את הניחוש שלי</label>
      {withMine && <label className="grid gap-1 text-sm">שם שיופיע בסרטון (לא חובה, עד שתי מילים)
        <input type="text" value={name} maxLength={30} onChange={e => setName(e.target.value)} placeholder="למשל: יוסי כהן" className="bg-paper border border-paper-line rounded-xl px-3 py-2 w-full text-base" />
        <span className="text-xs text-ink-soft">{guesserName(name) ? `בסרטון ייכתב: "הניחוש של ${guesserName(name)}"` : 'בסרטון ייכתב: "הניחוש שלי"'}</span>
      </label>}
    </div>}
    <button type="button" className={`f-btn${options ? " pri" : ""}`} onClick={() => state === "idle" && canMine ? setState("options") : make()} disabled={state === "busy"} aria-busy={state === "busy"}>
      {state === "busy" ? `יוצרים סרטון… ${Math.round(progress * 100)}%` : options ? "יצירת הסרטון" : "צור סרטון"}
    </button>
    {state === "busy" && <div className="h-1.5 rounded-full bg-paper-line overflow-hidden" aria-hidden="true"><div className="h-full bg-signal" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
    {state === "failed" && <p role="status" className="text-sm font-bold">יצירת הסרטון לא הצליחה בדפדפן הזה. נסו בכרום או בספארי עדכניים.</p>}
    {state === "nodata" && <p role="status" className="text-sm font-bold">נתוני המשתתפים אינם זמינים כרגע. אפשר לנסות שוב בעוד רגע.</p>}
  </div>;
}
