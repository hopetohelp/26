// GitHub Pages מגיש מעבר בלבד; קבצי נתונים ישנים נשמרים לקישורים ישירים.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function redirectHtml() {
  const script = readFileSync(resolve(here, "legacy-redirect-client.js"), "utf8");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#EEF1F5">
<title>בחירות 2026 — מעבר לאתר</title><link rel="icon" href="/26/favicon.svg" type="image/svg+xml">
<script>${script}</script><link rel="stylesheet" href="/26/redirect.css">
<noscript><meta http-equiv="refresh" content="0;url=https://26.hopetohelp.net/"></noscript>
</head><body><div class="shell">
<header class="masthead"><div class="brand"><span class="brand-mark">26</span><span>בחירות 2026</span></div><span class="edition">האתר החדש</span></header>
<main class="card"><div class="eyebrow"><span class="signal"></span> מעבר לכתובת הפרטית</div>
<h1>ממשיכים לבחירות 2026</h1>
<p id="status" role="status">מעבירים אותך לאותו עמוד באתר החדש…</p>
<div id="progress" class="progress" aria-hidden="true"><span></span></div>
<div id="fallback" hidden><p>המעבר האוטומטי לא הושלם. המידע ששמור בדפדפן בכתובת הישנה נשאר כאן.</p>
<div class="actions"><button id="retry" type="button">לנסות שוב</button><a id="manual" href="https://26.hopetohelp.net/">להמשיך לאתר החדש</a></div>
<p class="note">המשך ישיר עשוי להשאיר כאן התחברות או טיוטות שלא הועברו.</p></div>
</main><footer><bdi dir="ltr">26.hopetohelp.net</bdi> <span aria-hidden="true">·</span> אותם חשבונות ונתונים</footer></div></body></html>`;
}

export function buildLegacyRedirect(source = "dist", target = "legacy-redirect") {
  mkdirSync(target, { recursive: true });
  for (const path of ["data", "llms.txt", "dashboard.json", "poll-ranges.json", "parties", "icons", "favicon.svg", "manifest.webmanifest"]) {
    const from = resolve(source, path);
    if (existsSync(from)) cpSync(from, resolve(target, path), { recursive: true });
  }
  mkdirSync(resolve(target, "fonts"), { recursive: true });
  for (const font of ["rubik-hebrew.woff2", "rubik-latin.woff2", "robotomono-digits.woff2"])
    cpSync(resolve(here, "../src/assets/fonts", font), resolve(target, "fonts", font));
  cpSync(resolve(here, "legacy-redirect.css"), resolve(target, "redirect.css"));
  const html = redirectHtml();
  writeFileSync(resolve(target, "index.html"), html);
  writeFileSync(resolve(target, "404.html"), html);
  writeFileSync(resolve(target, "sw.js"), `self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys()
  .then((keys) => Promise.all(keys.filter((key) => key.startsWith("elections26-")).map((key) => caches.delete(key))))
  .then(() => self.clients.claim())));
`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildLegacyRedirect();
