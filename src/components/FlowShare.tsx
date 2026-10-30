import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SITE_URL } from "../lib/shareGuess";
import { loadLogo } from "../pages/guess/communityShare";
import { useHagzara } from "../pages/simple/hagzara";
import { useSession } from "../pages/guess/useCrowd";
import { countImage } from "../lib/visits";
import { flow, newName } from "../lib/voterFlow";
import type { BallotUnits as Units } from "../lib/ballotLookup";
import { buildScene, type Who, type Where } from "../lib/flowShareData";
import { drawScene, type ShareTheme } from "../lib/flowShareDraw";
import { renderLegacy, type Dir } from "../lib/flowShareLegacy";
import SearchField from "./SearchField";

const ENVELOPES = "9999";
const PARTIES = flow.new.filter((id) => id !== "other" && id !== "abstain");
const THEME_KEY = "flow-share-theme";
const readTheme = (): ShareTheme => { try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; } };

/** אייקונים כמו בכפתור התצורה בסרגל האתר: ירח — תצוגה כהה, שמש — תצוגה בהירה */
const MODE_ICON: Record<ShareTheme, JSX.Element> = {
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
};
const THEME_NAME: Record<ShareTheme, string> = { dark: "כהה", light: "בהירה" };

/**
 * חלון השיתוף של "מה השתנה": מי (כל המפלגות, חרדים, מפלגה), איפה (כל הארץ או עיר — בכל בחירה) ותצוגה (כהה או בהירה, כפתור אייקון בפינה).
 * התמונה בגודל קבוע 1080×1350 עם מסגרת הגזרה (`src/lib/flowShareDraw.ts`); הנתונים מ-`src/lib/flowShareData.ts`.
 */
export default function FlowShare({ onClose }: { onClose: () => void }) {
  const [who, setWho] = useState<Who>("party");
  const [party, setParty] = useState(PARTIES[0]);
  const [where, setWhere] = useState<Where>("country");
  const [city, setCity] = useState("");
  const [dir, setDir] = useState<Dir>("from");
  const [blocs, setBlocs] = useState(false);
  const [theme, setTheme] = useState<ShareTheme>(readTheme);
  const [units, setUnits] = useState<Units | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const logoUrl = useHagzara(useSession())?.logoUrl ?? null;
  const [logo, setLogo] = useState<ImageBitmap | null>(null);
  useEffect(() => { let live = true; void loadLogo(logoUrl).then((b) => live && setLogo(b)); return () => { live = false; }; }, [logoUrl]);
  useEffect(() => {
    const trigger = document.activeElement;
    box.current?.focus();
    return () => { if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}flow-units.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setUnits).catch(() => setMsg("נתוני הערים לא נטענו.")); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const names = useMemo(() => Object.entries(units?.places ?? {}).filter(([c]) => c !== ENVELOPES).map(([, p]) => p.name).sort((a, b) => a.localeCompare(b, "he")), [units]);
  /** הצעות שמתחילות בהקלדה קודם, ואחריהן שאר ההתאמות; מתעדכן בכל אות */
  const options = useMemo(() => {
    const q = city.trim(), hit = names.filter((n) => !q || n.includes(q));
    return [...hit.filter((n) => n.startsWith(q)), ...hit.filter((n) => !n.startsWith(q))].map((n) => ({ id: n, value: n, label: n }));
  }, [names, city]);
  const cityMode = where === "city";
  const allParties = who === "all";
  // כל המפלגות — בעיצוב הקיים (src/lib/flowShareLegacy.ts); מפלגה וחרדים — בעיצוב החדש
  const scene = useMemo(() => (allParties ? null : buildScene({ who, party, where, city }, units)), [allParties, who, party, where, city, units]);
  const legacyReady = allParties && !!units && (!cityMode || names.includes(city.trim()));
  useEffect(() => {
    if (!scene && !legacyReady) { setFile(null); setUrl(null); return; }
    let live = true;
    (scene ? drawScene(scene, { theme, logo }) : renderLegacy({ logo, who: "all", party, where, city, dir, blocs }, units))
      .then((b) => { if (!live) return; setMsg(null); setFile(new File([b], "elections26-changes.png", { type: "image/png" })); setUrl(URL.createObjectURL(b)); })
      .catch(() => live && setMsg("הכנת התמונה לא הצליחה."));
    return () => { live = false; };
  }, [scene, theme, logo, legacyReady, party, where, city, dir, blocs, units]);
  const pickTheme = () => {
    const next: ShareTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* אין אחסון — התצוגה נשארת לשיחה הזאת */ }
  };
  const share = async () => {
    if (!file) return;
    countImage("changes");
    const text = `מאיפה הגיעו המצביעים של כל מפלגה?\nהשוואה של כל הקלפיות, 2022 מול 2026\n${SITE_URL}#/changes`;
    try {
      if (navigator.canShare?.({ files: [file], text })) await navigator.share({ files: [file], text });
      else if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else save(true);
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. אפשר לשמור ולשתף."); }
  };
  // תמונה שנשמרה נספרת ("תמונת מה השתנה"); משיתוף שנפל לשמירה — כבר נספרה
  const save = (counted = false) => { if (!url || !file) return; if (!counted) countImage("changes"); const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); };
  const seg = <T extends string>(label: string, value: T, set: (v: T) => void, opts: { id: T; label: string }[]) => (
    <div className="f-seg fit" role="group" aria-label={label}>
      {opts.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => set(o.id)}>{o.label}</button>)}
    </div>
  );
  const ready = (!!scene || legacyReady) && !!url;
  return createPortal(<div className="f-modal" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="f-flow-share" style={{ position: "relative" }}>
      {!allParties && <button type="button" onClick={pickTheme} aria-label={`תצוגה: ${THEME_NAME[theme]}. בלחיצה: ${THEME_NAME[theme === "dark" ? "light" : "dark"]}`} title={`תצוגה: ${THEME_NAME[theme]}`}
        className="absolute left-3 top-3 flex items-center justify-center rounded-full w-[36px] h-[36px] border border-current opacity-80 hover:opacity-100">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{MODE_ICON[theme]}</svg>
      </button>}
      <h2 id="f-flow-share" className="text-lg font-bold pe-12">שיתוף: מה השתנה</h2>
      {seg("מי", who, setWho, [{ id: "all", label: "כל המפלגות" }, { id: "haredi", label: "חרדים" }, { id: "party", label: "מפלגה" }])}
      {who === "party" && <label className="grid gap-1 text-sm">מפלגה
        <select value={party} onChange={(e) => setParty(e.target.value)} className="bg-paper border border-line rounded-xl px-3 py-2 w-full text-base">
          {PARTIES.map((id) => <option key={id} value={id}>{newName(id)}</option>)}
        </select></label>}
      {allParties && seg("כיוון", dir, setDir, [{ id: "from", label: "מאיפה הגיעו" }, { id: "to", label: "לאן הלכו" }])}
      {seg("איפה", where, setWhere, [{ id: "country", label: "כל הארץ" }, { id: "city", label: "עיר" }])}
      {cityMode && <SearchField label="עיר" value={city} options={options} onChange={setCity} />}
      {allParties && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blocs} onChange={(e) => setBlocs(e.target.checked)} className="w-5 h-5" />להוסיף מעבר בין הגושים</label>}
      {ready ? <img src={url!} alt={scene ? `תמונת שיתוף: ${scene.title}` : "תמונת שיתוף: מה השתנה"} /> : <p className="text-sm text-ink-soft">{cityMode && units && !scene && !legacyReady ? "בחרו עיר מהרשימה." : "מכינים את התמונה…"}</p>}
      {file && ready && <div className="flex gap-2"><button type="button" className="f-btn pri flex-1" onClick={share}>שיתוף</button><button type="button" className="f-btn flex-1" onClick={() => save()}>שמירה</button></div>}
      <button type="button" className="f-btn" onClick={onClose}>סגירה</button>
      {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
    </div></div>, document.body);
}
