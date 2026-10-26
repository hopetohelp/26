import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import { PARTY_IMAGES } from "../../lib/partyImages";
import { SITE_URL } from "../../lib/shareGuess";
import { groupImageUrl, groupUrl } from "../../lib/groupLink";
import { SIMPLE_BLOCS, simpleSelection, simpleValue } from "../../lib/simpleSources";
import { useCrowdDashboard } from "../../lib/sources";
import { BLOC_COLORS, type PromoData, type PromoList } from "../../lib/promoVideo";
import type { PromoFile } from "../../lib/promoEncode";
import { nameOf } from "../guess/model";
import { loadLogo } from "../guess/communityShare";
import { blocSlices, orderedLists } from "./shared";
import type { Dashboard } from "../../lib/crowdApi";

/** סדר הגושים בעוגה — כמו העוגה באתר */
const RING = ["netanyahu", "eisenkot", "arab", "haredi"];
const GOAL = 3000;
const loadImg = (src: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const day = (iso?: string) => { const d = iso ? new Date(iso) : new Date(); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };

/**
 * נתוני הסרטון — מאותן פונקציות של המסכים (מקור אמת אחד): ממוצע הסקרים של האתר (simpleValue), ממוצע הניחושים מלוח המשתתפים,
 * סדר הרשימות של הגרף (orderedLists), הגושים והשלמים שלהם (blocSlices), ומספר הניחושים המלאים ברגע היצירה.
 */
export async function buildPromoData(dash: Dashboard, group: { slug: string; logoUrl: string | null } | null): Promise<PromoData> {
  const selection = simpleSelection("all");
  const crowd: Record<string, number> = Object.fromEntries((dash.seats?.full ?? []).map(r => [r.list, r.mean]));
  const polls = (id: string) => simpleValue(selection, [id]) ?? 0;
  const ids = orderedLists(selection, [], crowd);
  const lists: PromoList[] = await Promise.all(ids.map(async id => ({ id, name: nameOf(id), polls: polls(id), crowd: crowd[id] ?? 0, img: PARTY_IMAGES[id] ? await loadImg(`${import.meta.env.BASE_URL}${PARTY_IMAGES[id].file}`) : null })));
  const pollValues = Object.fromEntries(ids.map(id => [id, polls(id)]));
  const sp = blocSlices(pollValues), sc = blocSlices(crowd);
  const blocs = RING.map(id => {
    const p = sp.find(s => s.id === id), c = sc.find(s => s.id === id);
    return { id, short: p?.short ?? c?.short ?? id, polls: p?.value ?? 0, crowd: c?.value ?? 0, shown: { polls: p?.shown ?? 0, crowd: c?.shown ?? 0 }, color: BLOC_COLORS[id] };
  });
  const haredi = lists.filter(l => SIMPLE_BLOCS[1].lists.includes(l.id) && (l.polls >= .5 || l.crowd >= .5));
  const gap = [...lists].sort((a, b) => Math.abs(b.crowd - b.polls) - Math.abs(a.crowd - a.polls))[0];
  const link = group ? groupUrl(group.slug) : SITE_URL, q = qrcode(0, "M");
  q.addData(link); q.make();
  const m = q.getModuleCount(), qr = Array.from({ length: m }, (_, r) => Array.from({ length: m }, (_, k) => q.isDark(r, k)));
  const logo = await loadLogo(group?.logoUrl ?? groupImageUrl({ slug: "hagzara" }, "promo"));
  return { asOf: day(dash.publishedAt ?? undefined), lists, blocs, haredi, gap, guesses: dash.seats?.n ?? 0, goal: GOAL, host: SITE_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, ""), logo, qr };
}

/** "צור סרטון" בחלון השיתוף: הסרטון נבנה בדפדפן מהנתונים של הרגע הזה — בלי AI, בלי שרת ובלי עלות */
export default function PromoVideo({ group }: { group: { slug: string; logoUrl: string | null } | null }) {
  const crowd = useCrowdDashboard();
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<PromoFile | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const dash = crowd.dashboard;
  const make = async () => {
    if (!dash) return;
    setState("busy"); setProgress(0); setMsg(null);
    try {
      const [{ renderPromoVideo }, data] = await Promise.all([import("../../lib/promoEncode"), buildPromoData(dash, group)]);
      const f = await renderPromoVideo(data, setProgress);
      setFile(f); setUrl(URL.createObjectURL(f.blob)); setState("done");
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
  return <div className="grid gap-1">
    <button type="button" className="f-btn" onClick={make} disabled={!dash || state === "busy"} aria-busy={state === "busy"}>
      {state === "busy" ? `יוצרים סרטון… ${Math.round(progress * 100)}%` : "צור סרטון"}
    </button>
    {state === "busy" && <div className="h-1.5 rounded-full bg-paper-line overflow-hidden" aria-hidden="true"><div className="h-full bg-signal" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
    {state === "failed" && <p role="status" className="text-sm font-bold">יצירת הסרטון לא הצליחה בדפדפן הזה. נסו בכרום או בספארי עדכניים.</p>}
    {!dash && crowd.failed && <p className="text-xs text-ink-soft">נתוני המשתתפים אינם זמינים כרגע, ולכן אי אפשר ליצור סרטון.</p>}
  </div>;
}
