/**
 * מצב הטמעה (הכרעת בעלים 28.10.2026): "תוצאות" ו"מה השתנה" מוצגים בתוך אתרים אחרים ב-iframe.
 * הכתובת: #/results-2026?embed=1 או #/past?tab=changes&embed=1; אופציונלי &theme=light|dark.
 * במצב זה — בלי סרגל, תפריט וחשבון; שורת מקור בתחתית; הגובה נשלח לאתר המארח.
 */
export const SITE_ORIGIN = "https://26.hopetohelp.net";

/** המסכים שמותר להטמיע: נתיב ⇐ לשונית (אם יש) ושם */
export const EMBEDDABLE: { path: string; tab?: string; name: string }[] = [
  { path: "/results-2026", name: "תוצאות" },
  { path: "/past", tab: "changes", name: "מה השתנה" },
];

function hashParams(hash: string): URLSearchParams {
  const q = hash.indexOf("?");
  return new URLSearchParams(q < 0 ? "" : hash.slice(q + 1));
}

export function isEmbed(hash = typeof location !== "undefined" ? location.hash : ""): boolean {
  return hashParams(hash).get("embed") === "1";
}

export function embedTheme(hash = typeof location !== "undefined" ? location.hash : ""): "light" | "dark" | null {
  const t = hashParams(hash).get("theme");
  return t === "light" || t === "dark" ? t : null;
}

/** המסך הנוכחי ניתן להטמעה? */
export function embeddableFor(pathname: string, tab: string | null) {
  return EMBEDDABLE.find((e) => e.path === pathname && (e.tab ?? null) === (e.tab ? tab : null)) ?? null;
}

/** כתובת ההטמעה של מסך */
export function embedUrl(e: { path: string; tab?: string }): string {
  return `${SITE_ORIGIN}/#${e.path}?${e.tab ? `tab=${e.tab}&` : ""}embed=1`;
}

/** קוד ההטמעה להעתקה: iframe וסקריפט קצר להתאמת הגובה */
export function embedCode(e: { path: string; tab?: string; name: string }): string {
  return `<iframe src="${embedUrl(e)}" title="בחירות 2026 — ${e.name}" style="width:100%;border:0;min-height:600px" loading="lazy" data-elections26></iframe>
<script>addEventListener("message",function(m){if(m.origin!=="${SITE_ORIGIN}"||!m.data||m.data.type!=="elections26:height")return;document.querySelectorAll("iframe[data-elections26]").forEach(function(f){if(f.contentWindow===m.source)f.style.height=m.data.height+"px"})});</script>`;
}
