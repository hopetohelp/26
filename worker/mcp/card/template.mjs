/**
 * בונה את מסמך הכרטיס (HTML אחד) מ-card.css, card.js והטוקנים של האתר (src/index.css: ‏:root ו-[data-dark]).
 * 🔴 הצבעים נגזרים, לא מועתקים: שינוי צבע באתר ⇐ `node worker/mcp/card/build.mjs`, ובדיקה נכשלת עד שהקובץ הנגזר מעודכן.
 * טהור (בלי fs) — כדי שהבדיקה תבנה אותו ותשווה.
 */
const block = (css, selector) => {
  const i = css.indexOf(selector + " {");
  if (i < 0) throw new Error(`חסר ${selector} ב-src/index.css`);
  const body = css.slice(i, css.indexOf("}", i));
  return [...body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)].filter(([, k]) => !k.startsWith("--font")).map(([, k, v]) => `${k}:${v.trim()}`).join(";");
};

export function buildCardHtml({ indexCss, cardCss, cardJs, site }) {
  const light = block(indexCss, ":root");
  const dark = block(indexCss, "[data-dark]");
  const tokens = `:root{${light}}:root[data-theme="dark"]{${dark}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark};color-scheme:dark}}`;
  const js = cardJs.replace("__SITE__", site).replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>בחירות 2026 — תשובה</title><style>${tokens}\n${cardCss}</style></head><body><main id="app" aria-live="polite"></main><script>${js}</script></body></html>`;
}
