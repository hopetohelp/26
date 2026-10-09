/**
 * שמירת האתר במכשיר: האתר נפתח גם בלי רשת או ברשת חלשה. נרשם מ-src/lib/offline.ts.
 * דפים ונתונים (כולל dashboard.json) — קודם מהרשת, ואם היא לא עונה תוך 4 שניות — העותק השמור.
 * קבצי הבנייה (assets/, שמם משתנה בכל בנייה) — מהעותק השמור, ונשמרים ב-60 האחרונים בלבד.
 * פניות לשרתים אחרים (השערות, הערות) אינן עוברות כאן; לשמירה בלי חיבור יש תור משלה (src/lib/outbox.ts).
 */
const PAGES = "elections26-pages-v1";
const ASSETS = "elections26-assets-v1";
const TIMEOUT_MS = 4000;
const MAX_ASSETS = 60;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(["./", "./index.html"])).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("elections26-") && k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  const net = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
  try {
    const fast = await Promise.race([net, timeout]);
    if (fast) return fast;
  } catch { /* אין רשת ⇐ העותק השמור */ }
  const saved = await cache.match(request, { ignoreSearch: true })
    ?? (request.mode === "navigate" ? await cache.match("./index.html") : undefined);
  return saved ?? net;
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok) { await cache.put(request, res.clone()); void trim(cache); }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(url.pathname.includes("/assets/") ? cacheFirst(req) : networkFirst(req));
});
