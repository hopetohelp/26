import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it } from "vitest";
import { DICTIONARY, DICTIONARY_IDS, MethodLaw, MethodNumbers, MethodSources } from "./Method";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

describe("מילון המספרים", () => {
  it("כל methodAnchor שבאתר קיים כערך במילון (אחרת הקישור 'איך זה חושב?' שבור)", () => {
    const used = new Set<string>();
    for (const f of walk("src")) for (const m of readFileSync(f, "utf8").matchAll(/methodAnchor="([a-z-]+)"/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(5);
    // ערך במילון, או עוגן בתוך ערך (agreements בתוך engine, voters בתוך results): ב-DOM של מסך המילון
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: "/method", children: createElement(MethodNumbers) }));
    for (const a of used) expect(html, `methodAnchor="${a}" חסר במילון`).toContain(`id="${a}"`);
  });

  it("לכל ערך סוג, מקור והנחה, והמזהים ייחודיים", () => {
    expect(new Set(DICTIONARY_IDS).size).toBe(DICTIONARY_IDS.length);
    for (const e of DICTIONARY) for (const k of ["title", "where", "kind", "source", "assumption"] as const) expect(e[k].length, `${e.id}.${k}`).toBeGreaterThanOrEqual(3);
  });

  it("הלשוניות מציגות את כל העוגנים הישנים (שיטה, מקורות, חוק)", () => {
    const html = [MethodNumbers, MethodSources, MethodLaw]
      .map((C) => renderToStaticMarkup(createElement(StaticRouter, { location: "/method", children: createElement(C) })))
      .join("");
    for (const id of [...DICTIONARY_IDS, "agreements", "voters", "sources", "updates", "privacy", "law", "limits"]) expect(html, id).toContain(`id="${id}"`);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size, "מזהים כפולים").toBe(ids.length);
  });
});
