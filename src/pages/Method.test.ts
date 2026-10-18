import { ARCHIVED_METHODS } from "../lib/modelVisibility";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it } from "vitest";
import { quality } from "../lib/quality";
import { polls } from "../lib/data";
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
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: "/method", children: createElement(MethodNumbers, { includeArchived: true }) }));
    for (const a of used) expect(html, `methodAnchor="${a}" חסר במילון`).toContain(`id="${a}"`);
  });

  it("לכל ערך סוג, מקור והנחה, והמזהים ייחודיים", () => {
    expect(new Set(DICTIONARY_IDS).size).toBe(DICTIONARY_IDS.length);
    for (const e of DICTIONARY) for (const k of ["title", "where", "kind", "source", "assumption"] as const) expect(e[k].length, `${e.id}.${k}`).toBeGreaterThanOrEqual(3);
  });

  it("הלשוניות מציגות את כל העוגנים הישנים (שיטה, מקורות, חוק)", () => {
    const html = [MethodNumbers, MethodSources, MethodLaw]
      .map((C) => renderToStaticMarkup(createElement(StaticRouter, { location: "/method", children: createElement(C, C === MethodNumbers ? { includeArchived: true } : {}) })))
      .join("");
    for (const id of [...DICTIONARY_IDS, "agreements", "voters", "sources", "coverage", "data-checks", "corrections-log", "updates", "privacy", "law", "limits"]) expect(html, id).toContain(`id="${id}"`);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size, "מזהים כפולים").toBe(ids.length);
  });

  it("לכל קטע במסך יש כפתור קישור נפרד (ערכי המילון והקטעים במקורות ובחוק)", () => {
    const count = (C: typeof MethodNumbers) => (renderToStaticMarkup(createElement(StaticRouter, { location: "/method", children: createElement(C) })).match(/העתקת קישור לקטע:/g) ?? []).length;
    expect(count(MethodNumbers)).toBe(DICTIONARY.length - ARCHIVED_METHODS.size);
    expect(count(MethodSources)).toBe(6);
    expect(count(MethodLaw)).toBe(2);
  });

  it("מסך המקורות מציג את הכיסוי, הסתירות הפתוחות ויומן התיקונים מהנתונים", () => {
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: "/method", children: createElement(MethodSources) }));
    expect(html).toContain("כל הסקרים מול החישובים");
    expect(quality.coverage.total).toBe(polls.length);
    expect(quality.coverage.usable).toBeLessThanOrEqual(quality.coverage.total);
    expect(html).toContain(`כל התיקונים (${quality.corrections.length})`);
    expect(quality.corrections.length).toBe(polls.reduce((n, p) => n + (p.corrections?.length ?? 0), 0));
    for (const c of quality.conflicts) expect(html).toContain(c.detail.replace(/&/g, "&amp;"));
    // כל סקר שיש לו אימות או תיקון נושא מצב לפי שדה
    for (const p of polls) if (p.verification || p.corrections?.length) expect(p.fieldChecks, p.id).toBeDefined();
  });
});
