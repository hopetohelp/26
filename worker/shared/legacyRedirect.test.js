import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLegacyRedirect, redirectHtml } from "../../scripts/build-legacy-redirect.mjs";

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

  it("ממשיכה ישירות כשיש רק מזהה ביקור או העדפת תצוגה", () => {
    const data = new Map([["elections26.vid", "visitor"], ["elections26.mode", "dark"]]);
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
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("מעבירה מידע מקומי דרך חלון האתר החדש לפני המעבר, בלי למחוק לפני אישור", () => {
    const data = new Map([["elections26.crowd.token", "private-token"], ["elections26.vid", "old-visitor"]]);
    const storage = {
      get length() { return data.size; },
      key: (i) => [...data.keys()][i],
      getItem: (key) => data.get(key) ?? null,
      removeItem: (key) => data.delete(key),
    };
    const listeners = {};
    const elements = {
      status: { textContent: "" },
      transfer: { hidden: true, onclick: null },
      manual: { href: "" },
    };
    const sent = [];
    const popup = { postMessage: (value, target) => sent.push([value, target]), close: () => {} };
    let next;
    let popupUrl;
    const window = {
      location: { href: "https://hopetohelp.github.io/26/#/g/group", replace: (value) => { next = value; } },
      addEventListener: (name, fn) => { listeners[name] = fn; },
      open: (url) => { popupUrl = url; return popup; },
    };
    runInNewContext(script, { window, URL, localStorage: storage, document: { getElementById: (id) => elements[id] } });
    expect(next).toBeUndefined();
    listeners.DOMContentLoaded();
    expect(elements.transfer.hidden).toBe(false);
    elements.transfer.onclick();
    expect(popupUrl).toBe("https://26.hopetohelp.net/?migration=1");
    expect(data.get("elections26.crowd.token")).toBe("private-token");
    listeners.message({ origin: "https://26.hopetohelp.net", source: popup, data: { kind: "e26-migration-ready" } });
    expect(sent[0][0].kind).toBe("e26-migration-data");
    expect(sent[0][0].entries.length).toBe(2);
    expect(sent[0][1]).toBe("https://26.hopetohelp.net");
    listeners.message({ origin: "https://26.hopetohelp.net", source: popup, data: { kind: "e26-migration-done" } });
    expect(data.size).toBe(0);
    expect(next).toBe("https://26.hopetohelp.net/#/g/group");
  });
});
