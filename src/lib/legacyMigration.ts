/** העברת נתוני דפדפן מהכתובת הישנה, בלי לחשוף סשן או טיוטה בכתובת. */
const OLD_ORIGIN = "https://hopetohelp.github.io";
const NEW_ORIGIN = "https://26.hopetohelp.net";
const KEY = /^(?:elections26\.(?:crowd\.(?:token|link|linkAck|consent|intro|picture|(?:draft|saved|pending)\.(?:seats|blocs|vote))|feedback(?:\.outbox)?|camps|lineage|source\.v1\.[\w-]+|mode|vid|noCount|supportSeen|install\.dismissed|drawerSeen\.[\w-]+)|g-seen:[\w-]+)$/;
const KEEP_NEW = /^(?:elections26\.(?:crowd\.(?:linkAck|consent|intro|picture)|mode|vid|noCount|supportSeen|install\.dismissed|drawerSeen\.[\w-]+)|g-seen:[\w-]+)$/;

type Entry = [string, string];

/** פעולה מלאה או שום שינוי: מידע שכבר נוצר באתר החדש אינו נדרס. */
export function importLegacyEntries(input: unknown, storage: Storage, replace = false): "done" | "conflict" | "error" {
  if (!Array.isArray(input) || input.length > 60 || JSON.stringify(input).length > 200_000) return "error";
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" || typeof item[1] !== "string" || !KEY.test(item[0]) || seen.has(item[0])) return "error";
    seen.add(item[0]);
    entries.push([item[0], item[1]]);
  }
  const before = new Map<string, string | null>();
  try {
    for (const [key, value] of entries) {
      const old = storage.getItem(key);
      if (old !== null && old !== value && !KEEP_NEW.test(key) && !replace) return "conflict";
      before.set(key, old);
    }
    for (const [key, value] of entries) if (before.get(key) === null || (replace && !KEEP_NEW.test(key))) storage.setItem(key, value);
    return "done";
  } catch {
    for (const [key, value] of before) {
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* האחסון עצמו חסום */ }
    }
    return "error";
  }
}

type HandoffResult = { kind: "done" | "conflict" | "error"; next?: string };
const apiBases = [
  import.meta.env.VITE_FEEDBACK_URL ? `${import.meta.env.VITE_FEEDBACK_URL.replace(/\/$/, "")}/crowd` : "https://elections26-feedback.hopetohelp-il.workers.dev/crowd",
  import.meta.env.VITE_CROWD_URL?.replace(/\/$/, "") || "https://elections26-crowd.hopetohelp-il.workers.dev",
];

async function postHandoff(path: string, ticket: string): Promise<{ entries?: unknown; next?: unknown }> {
  let last: unknown;
  for (const base of apiBases) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(base + path, {
        method: "POST", mode: "cors", cache: "no-store", credentials: "omit",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`handoff_${response.status}`);
      return await response.json();
    } catch (error) { last = error; }
    finally { clearTimeout(timeout); }
  }
  throw last;
}

/** קורא כרטיס זמני בלי להציג אסימון התחברות בכתובת. מסיים רק אחרי קליטה מוצלחת. */
export async function completeLegacyHandoff(ticket: string, replace = false): Promise<HandoffResult> {
  if (!/^[\w-]{43}$/.test(ticket)) return { kind: "error" };
  let next: string | undefined;
  try {
    const payload = await postHandoff("/migration/read", ticket);
    if (typeof payload.next !== "string") return { kind: "error" };
    const url = new URL(payload.next);
    if (url.origin !== NEW_ORIGIN || url.username || url.password) return { kind: "error" };
    next = url.href;
    const result = importLegacyEntries(payload.entries, window.localStorage, replace);
    if (result !== "done") return { kind: result, next };
    await postHandoff("/migration/finish", ticket);
    return { kind: "done", next };
  } catch { return { kind: "error", next }; }
}

/** בחירה מפורשת במידע הקיים באתר החדש מסיימת את המעבר בלי לדרוס אותו. */
export async function keepNewLegacyHandoff(ticket: string): Promise<void> {
  if (/^[\w-]{43}$/.test(ticket)) await postHandoff("/migration/finish", ticket);
}

export function receiveLegacyMigration(): void {
  if (typeof window === "undefined" || window.location.origin !== NEW_ORIGIN || !window.opener) return;
  const source = window.opener;
  window.addEventListener("message", (event) => {
    if (event.origin !== OLD_ORIGIN || event.source !== source || event.data?.kind !== "e26-migration-data") return;
    const result = importLegacyEntries(event.data.entries, window.localStorage);
    source.postMessage({ kind: `e26-migration-${result}` }, OLD_ORIGIN);
  });
  source.postMessage({ kind: "e26-migration-ready" }, OLD_ORIGIN);
}
