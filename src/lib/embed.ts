/**
 * מצב הטמעה (הכרעת בעלים 28.10.2026): "תוצאות" ו"מה השתנה" מוצגים בתוך אתרים אחרים ב-iframe.
 * הכתובת: #/results-2026?embed=1 או #/changes?embed=1; ברירת מחדל בהירה, theme=auto לפי המשתמש; dark נשמר לתאימות.
 * במצב זה — בלי סרגל, תפריט וחשבון; שורת מקור בתחתית; הגובה נשלח לאתר המארח.
 */
export const SITE_ORIGIN = "https://26.hopetohelp.net";

/** המסכים שמותר להטמיע: נתיב ⇐ לשונית (אם יש) ושם */
export type EmbedScreen = "results-2026" | "changes" | "changes-graphs";
export interface EmbedTarget { path: string; tab?: string; name: string; short?: string; screen: EmbedScreen }
export const EMBEDDABLE: EmbedTarget[] = [
  { path: "/results-2026", name: "תוצאות", screen: "results-2026" },
  { path: "/changes", name: "מה השתנה", short: "המסך המלא", screen: "changes" },
];
/** תצוגות מצומצמות של אותו מסך (הכרעת בעלים 30.10.2026): גרפי המעבר בלבד, עם מתג בין מפלגות לגושים */
const VARIANTS: Record<string, EmbedTarget[]> = {
  "/changes": [
    { path: "/flow-graphs", name: "מה השתנה — גרפי המעבר", short: "גרפי המעבר", screen: "changes-graphs" },
  ],
};

function hashParams(hash: string): URLSearchParams {
  const q = hash.indexOf("?");
  return new URLSearchParams(q < 0 ? "" : hash.slice(q + 1));
}

export function isEmbed(hash = typeof location !== "undefined" ? location.hash : ""): boolean {
  return hashParams(hash).get("embed") === "1";
}

export type EmbedTheme = "light" | "dark" | "auto";

export function embedTheme(hash = typeof location !== "undefined" ? location.hash : ""): EmbedTheme | null {
  if (!isEmbed(hash)) return null;
  const t = hashParams(hash).get("theme");
  return t === "dark" || t === "auto" ? t : "light";
}

/** המסך הנוכחי ניתן להטמעה? */
export function embeddableFor(pathname: string, tab: string | null) {
  return EMBEDDABLE.find((e) => e.path === pathname && (e.tab ?? null) === (e.tab ? tab : null)) ?? null;
}

/** כל אפשרויות ההטמעה של המסך הנוכחי: המסך עצמו, ואחריו התצוגות המצומצמות שלו */
export function embedTargetsFor(pathname: string, tab: string | null): EmbedTarget[] {
  const base = embeddableFor(pathname, tab);
  return base ? [base, ...(VARIANTS[base.path] ?? [])] : [];
}

/** כתובת ההטמעה של מסך */
export function embedUrl(e: { path: string; tab?: string }, theme: EmbedTheme = "light"): string {
  return `${SITE_ORIGIN}/#${e.path}?${e.tab ? `tab=${e.tab}&` : ""}embed=1&theme=${theme}`;
}

/** המסך שנספר בסטטיסטיקת ההטמעות, לפי נתיב החלון המוטמע */
export function embedScreenOf(pathname: string): EmbedScreen {
  return pathname === "/flow-graphs" ? "changes-graphs" : pathname === "/changes" ? "changes" : "results-2026";
}

/** קוד ההטמעה להעתקה: iframe וסקריפט קצר להתאמת הגובה */
export function embedCode(e: { path: string; tab?: string; name: string }, theme: EmbedTheme = "light"): string {
  return `<iframe src="${embedUrl(e, theme)}" title="בחירות 2026 — ${e.name}" style="width:100%;border:0;min-height:600px" loading="lazy" allow="web-share" data-elections26></iframe>
<script>addEventListener("message",function(m){if(m.origin!=="${SITE_ORIGIN}"||!m.data||m.data.type!=="elections26:height")return;document.querySelectorAll("iframe[data-elections26]").forEach(function(f){if(f.contentWindow===m.source){f.style.height=m.data.height+"px";if(m.data.scroll)f.scrollIntoView({block:"start",behavior:"smooth"})}})});</script>`;
}
