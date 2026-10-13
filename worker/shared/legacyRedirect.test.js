import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLegacyRedirect, redirectHtml } from "../../scripts/build-legacy-redirect.mjs";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { vi } from "vitest";

const script = redirectHtml().match(/<script>([\s\S]*?)<\/script>/)?.[1];
function redirected(url) {
  let result;
  const location = { href: url, replace: (next) => { result = next; } };
  runInNewContext(script, { window: { location }, URL });
  return result;
}

describe("העברת קישורים ישנים לאתר החדש", () => {
  it("שומרת מסך, קישור קבוצה, פרמטרים ועוגן בלי לייצר הפניה לאתר זר", () => {
    expect(redirected("https://hopetohelp.github.io/26/#/g/hagzara?tab=vote")).toBe("https://26.hopetohelp.net/#/g/hagzara?tab=vote");
    expect(redirected("https://hopetohelp.github.io/26/?mode=verifyEmail&oobCode=abc#/support")).toBe("https://26.hopetohelp.net/?mode=verifyEmail&oobCode=abc#/support");
    expect(redirected("https://hopetohelp.github.io/26/#/guess?t=private-token&f=feedback-token")).toBe("https://26.hopetohelp.net/#/guess?t=private-token&f=feedback-token");
  });

  it("ממשיכה ישירות כשאין מידע מקומי", () => {
    const data = new Map();
    let next;
    runInNewContext(script, {
      window: { location: { href: "https://hopetohelp.github.io/26/#/polls", replace: (value) => { next = value; } } },
      URL,
      localStorage: { get length() { return data.size; }, key: (i) => [...data.keys()][i], getItem: (key) => data.get(key) },
    });
    expect(next).toBe("https://26.hopetohelp.net/#/polls");
  });

  it("מפרסמת ב-GitHub דף מעבר ונתונים ישנים, בלי קובצי האפליקציה", () => {
    const root = mkdtempSync(join(tmpdir(), "elections26-redirect-"));
    try {
      const source = join(root, "dist"), target = join(root, "legacy");
      mkdirSync(join(source, "data"), { recursive: true });
      mkdirSync(join(source, "assets"));
      writeFileSync(join(source, "data", "index.json"), "{}");
      writeFileSync(join(source, "assets", "app.js"), "app");
      buildLegacyRedirect(source, target);
      expect(existsSync(join(target, "data", "index.json"))).toBe(true);
      expect(existsSync(join(target, "assets"))).toBe(false);
      expect(readFileSync(join(target, "index.html"), "utf8")).toContain("26.hopetohelp.net");
      expect(existsSync(join(target, "404.html"))).toBe(true);
      expect(existsSync(join(target, "redirect.css"))).toBe(true);
      expect(existsSync(join(target, "fonts", "rubik-hebrew.woff2"))).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("מוסרת מידע אוטומטית לשרת חד-פעמי ושומרת את המקור", async () => {
    const data = new Map([["elections26.crowd.token", "private-token"], ["elections26.vid", "old-visitor"]]);
    const storage = {
      get length() { return data.size; },
      key: (i) => [...data.keys()][i],
      getItem: (key) => data.get(key) ?? null,
      removeItem: (key) => data.delete(key),
      setItem: (key, value) => data.set(key, value),
    };
    const listeners = {};
    const elements = {
      status: { textContent: "" },
      manual: { href: "" },
      fallback: { hidden: true },
      progress: { hidden: false },
      retry: { addEventListener: () => {} },
    };
    const sent = [];
    let next;
    const window = {
      location: { href: "https://hopetohelp.github.io/26/#/g/group", replace: (value) => { next = value; } },
    };
    runInNewContext(script, {
      window, URL, localStorage: storage, TextEncoder, crypto: webcrypto, AbortController, setTimeout, clearTimeout,
      fetch: async (url, init) => {
        sent.push({ url, body: JSON.parse(init.body) });
        return { ok: true, json: async () => ({ ticket: "T".repeat(43) }) };
      },
      document: { readyState: "loading", addEventListener: (name, fn) => { listeners[name] = fn; }, getElementById: (id) => elements[id] },
    });
    expect(next).toBeUndefined();
    listeners.DOMContentLoaded();
    await vi.waitFor(() => expect(next).toBe("https://26.hopetohelp.net/#handoff=" + "T".repeat(43)));
    expect(data.get("elections26.crowd.token")).toBe("private-token");
    expect(sent[0].body.entries.length).toBe(2);
    expect(sent[0].body.next).toBe("https://26.hopetohelp.net/#/g/group");
    expect(sent[0].url).toContain("/migration/create");
  });
});
