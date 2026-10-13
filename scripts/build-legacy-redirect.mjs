// GitHub Pages מקבל דף מעבר בלבד; האתר המלא מתפרסם ב-Cloudflare Pages.
// קובצי נתונים ותמונות ישנים נשמרים כדי שקישורים ישירים שכבר הופצו ימשיכו לענות.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function redirectHtml() {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>בחירות 2026 — מעבר לכתובת החדשה</title>
<script>
  const next = new URL(window.location.href);
  next.protocol = "https:";
  next.host = "26.hopetohelp.net";
  next.pathname = next.pathname.replace(/^\\/26(?:\\/|$)/, "/");
  const allowed = /^(?:elections26\\.(?:crowd\\.(?:token|link|linkAck|consent|intro|picture|(?:draft|saved|pending)\\.(?:seats|blocs|vote))|feedback(?:\\.outbox)?|camps|lineage|source\\.v1\\.[\\w-]+|mode|vid|noCount|supportSeen|install\\.dismissed|drawerSeen\\.[\\w-]+)|g-seen:[\\w-]+)$/;
  const important = /^elections26\\.(?:crowd\\.(?:token|link|(?:draft|saved|pending)\\.(?:seats|blocs|vote))|feedback(?:\\.outbox)?|camps|lineage|source\\.v1\\.[\\w-]+)$/;
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && allowed.test(key)) entries.push([key, localStorage.getItem(key)]);
    }
  } catch {}
  // מזהה ביקור או העדפת תצוגה בלבד אינם מצדיקים עצירה בכל קישור ישן.
  if (!entries.some(([key]) => important.test(key))) window.location.replace(next.href);
  else window.addEventListener("DOMContentLoaded", () => {
    const status = document.getElementById("status");
    const button = document.getElementById("transfer");
    const manual = document.getElementById("manual");
    button.hidden = false;
    manual.href = next.href;
    let popup = null;
    button.onclick = () => {
      if (entries.length > 60 || JSON.stringify(entries).length > 200000) {
        status.textContent = "המידע המקומי גדול מדי להעברה אוטומטית. הוא עדיין שמור בדפדפן הישן.";
        return;
      }
      popup = window.open("https://26.hopetohelp.net/?migration=1", "_blank");
      status.textContent = popup ? "מעבירים את המידע המקומי…" : "הדפדפן חסם פתיחת חלון. אפשרו חלונות קופצים ונסו שוב.";
    };
    window.addEventListener("message", (event) => {
      if (event.origin !== "https://26.hopetohelp.net" || event.source !== popup) return;
      if (event.data?.kind === "e26-migration-ready") popup.postMessage({ kind: "e26-migration-data", entries }, "https://26.hopetohelp.net");
      if (event.data?.kind === "e26-migration-conflict") status.textContent = "כבר יש מידע אחר באתר החדש. המידע הישן נשמר כאן ולא הוחלף. כדי למנוע דריסה, נדרשת בדיקה לפני העברתו.";
      if (event.data?.kind === "e26-migration-error") status.textContent = "ההעברה לא הצליחה. המידע הישן נשמר כאן; נסו שוב.";
      if (event.data?.kind === "e26-migration-done") {
        try { for (const [key, value] of entries) if (localStorage.getItem(key) === value) localStorage.removeItem(key); } catch {}
        popup.close();
        window.location.replace(next.href);
      }
    });
  });
</script>
<noscript><meta http-equiv="refresh" content="0;url=https://26.hopetohelp.net/"></noscript>
</head><body><main><h1>בחירות 2026 עבר לכתובת חדשה</h1>
<p>הכתובת החדשה היא <a id="manual" href="https://26.hopetohelp.net/">26.hopetohelp.net</a>.</p>
<p>בדפדפן הזה נמצא מידע מקומי מהאתר הישן. כדי לשמור אותו, לחצו על הכפתור; ייפתח חלון קצר להעברה מאובטחת.</p>
<button id="transfer" hidden>העברת המידע ופתיחת האתר החדש</button>
<p id="status" role="status"></p></main></body></html>`;
}

export function buildLegacyRedirect(source = "dist", target = "legacy-redirect") {
  mkdirSync(target, { recursive: true });
  for (const path of ["data", "llms.txt", "dashboard.json", "poll-ranges.json", "parties", "icons", "favicon.svg", "manifest.webmanifest"]) {
    const from = resolve(source, path);
    if (existsSync(from)) cpSync(from, resolve(target, path), { recursive: true });
  }
  const html = redirectHtml();
  writeFileSync(resolve(target, "index.html"), html);
  writeFileSync(resolve(target, "404.html"), html);
  // גרסה חדשה של ה-Service Worker הישן מוחקת עותקי אתר שמורים ומפסיקה לשמור את ממשק GitHub.
  writeFileSync(resolve(target, "sw.js"), `self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys()
  .then((keys) => Promise.all(keys.filter((key) => key.startsWith("elections26-")).map((key) => caches.delete(key))))
  .then(() => self.clients.claim())));
`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildLegacyRedirect();
