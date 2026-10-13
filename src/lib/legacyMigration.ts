/** העברת נתוני דפדפן מהכתובת הישנה לחלון של האתר החדש, בלי להכניס אסימונים לכתובת. */
const OLD_ORIGIN = "https://hopetohelp.github.io";
const NEW_ORIGIN = "https://26.hopetohelp.net";
const KEY = /^(?:elections26\.(?:crowd\.(?:token|link|linkAck|consent|intro|picture|(?:draft|saved|pending)\.(?:seats|blocs|vote))|feedback(?:\.outbox)?|camps|lineage|source\.v1\.[\w-]+|mode|vid|noCount|supportSeen|install\.dismissed|drawerSeen\.[\w-]+)|g-seen:[\w-]+)$/;
const KEEP_NEW = /^(?:elections26\.(?:mode|vid|noCount|supportSeen|install\.dismissed|drawerSeen\.[\w-]+)|g-seen:[\w-]+)$/;

type Entry = [string, string];

/** פעולה מלאה או שום שינוי: מידע שכבר נוצר באתר החדש אינו נדרס. */
export function importLegacyEntries(input: unknown, storage: Storage): "done" | "conflict" | "error" {
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
      if (old !== null && old !== value && !KEEP_NEW.test(key)) return "conflict";
      before.set(key, old);
    }
    for (const [key, value] of entries) if (before.get(key) === null) storage.setItem(key, value);
    return "done";
  } catch {
    for (const [key, value] of before) {
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* האחסון עצמו חסום */ }
    }
    return "error";
  }
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
