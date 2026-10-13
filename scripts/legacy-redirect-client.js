// רץ רק בכתובת הישנה. כרטיס המעבר נמצא בעוגן URL בלבד, לא בבקשת HTTP.
(() => {
  const APIS = ["https://elections26-feedback.hopetohelp-il.workers.dev/crowd", "https://elections26-crowd.hopetohelp-il.workers.dev"];
  const next = new URL(window.location.href);
  next.protocol = "https:";
  next.host = "26.hopetohelp.net";
  next.pathname = next.pathname.replace(/^\/26(?:\/|$)/, "/");
  const allowed = /^(?:elections26\.(?:crowd\.(?:token|link|linkAck|consent|intro|picture|(?:draft|saved|pending)\.(?:seats|blocs|vote))|feedback(?:\.outbox)?|camps|lineage|source\.v1\.[\w-]+|mode|vid|noCount|supportSeen|install\.dismissed|drawerSeen\.[\w-]+)|g-seen:[\w-]+)$/;
  const important = /^elections26\.(?:crowd\.(?:token|link|(?:draft|saved|pending)\.(?:seats|blocs|vote))|feedback(?:\.outbox)?|camps|lineage|source\.v1\.[\w-]+)$/;
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && allowed.test(key)) entries.push([key, localStorage.getItem(key)]);
    }
  } catch { /* אחסון חסום: אין מה להעביר */ }
  if (!entries.length) { window.location.replace(next.href); return; }
  const hasImportant = entries.some(([key]) => important.test(key));

  const RECEIPT = "elections26.migration.receipt";
  async function post(path, body) {
    let last;
    for (const api of APIS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(api + path, {
          method: "POST", mode: "cors", cache: "no-store", credentials: "omit",
          headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal,
        });
        if (!response.ok) throw new Error("http_" + response.status);
        return await response.json();
      } catch (error) { last = error; }
      finally { clearTimeout(timeout); }
    }
    throw last;
  }
  async function fingerprint() {
    const bytes = new TextEncoder().encode(JSON.stringify(entries));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function ready() {
    const status = document.getElementById("status");
    const fallback = document.getElementById("fallback");
    document.getElementById("manual").href = next.href;
    async function transfer() {
      status.textContent = "מעבירים אותך לאותו עמוד באתר החדש…";
      fallback.hidden = true;
      document.getElementById("progress").hidden = false;
      try {
        if (entries.length > 60 || JSON.stringify(entries).length > 200_000) throw new Error("too_large");
        const digest = await fingerprint();
        let receipt;
        try { receipt = JSON.parse(localStorage.getItem(RECEIPT) || "null"); } catch { /* אפשר להמשיך */ }
        if (receipt?.digest === digest && /^[\w-]{43}$/.test(receipt.ticket)) {
          const state = await post("/migration/status", { ticket: receipt.ticket });
          if (state.complete) { window.location.replace(next.href); return; }
        }
        const { ticket } = await post("/migration/create", { entries, next: next.href });
        if (!/^[\w-]{43}$/.test(ticket)) throw new Error("ticket");
        try { localStorage.setItem(RECEIPT, JSON.stringify({ digest, ticket })); } catch { /* לא חוסם את המעבר */ }
        window.location.replace("https://26.hopetohelp.net/#handoff=" + ticket);
      } catch {
        if (!hasImportant) { window.location.replace(next.href); return; }
        status.textContent = "לא הצלחנו להעביר את המידע אוטומטית.";
        document.getElementById("progress").hidden = true;
        fallback.hidden = false;
      }
    }
    document.getElementById("retry").addEventListener("click", transfer);
    transfer();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
})();
