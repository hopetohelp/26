import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CandleTrend from "./CandleTrend";

const DAY = 86_400_000;
const points = Array.from({ length: 10 }, (_, i) => ({ t: Date.UTC(2026, 8, 9) + i * 3 * DAY, v: 52 + (i % 3), lo: 46, hi: 64, n: 9, xs: [46, 49, 50, 51, 52, 53, 55, 60, 64] }));
const one = [{ id: "a", name: "הליכוד", points }];
const two = [
  { id: "a", name: "הליכוד", points },
  { id: "b", name: "יש עתיד", points: points.map((p) => ({ ...p, v: p.v - 30, lo: 12, hi: 28 })) },
];
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(CandleTrend, { title: "בדיקה", series: one, ...props }));

describe("גרף המגמה האחיד", () => {
  it("כפתור מקרא בפינה השמאלית העליונה (צמוד לסוף, שמאל בעברית), סגור כברירת מחדל", () => {
    const h = html();
    expect(h).toMatch(/<button[^>]*aria-expanded="false"[^>]*ms-auto[^>]*>/);
    expect(h).toContain("מקרא");
  });
  it("קווים מקווקווים כל 5 מנדטים, בגוש 61 במקום 60", () => {
    const plain = html();
    for (const v of [45, 50, 55, 60, 65]) expect(plain).toContain(`>${v}</span>`);
    const bloc = html({ majority: 61 });
    expect(bloc).toContain(">61</span>");
    expect(bloc).not.toContain(">60</span>");
  });
  it("אין חלון פתוח במנוחה (נפתח במעבר, בלחיצה ובחצים)", () => {
    expect(html()).not.toContain("חישוב:");
  });
  it("קפסולות מדוללות לפי מקום עם תג לכל ממוצע", () => {
    expect((html().match(/class="mk-pv[ "]/g) ?? []).length).toBeGreaterThan(0);
  });
  it("תוצאה בפועל: קו משני מקווקו עם תג", () => {
    expect(html({ markers: [{ t: points[9].t + 3 * DAY, v: 55 }] })).toContain('data-kind="secondary"');
  });
  it("השוואת רשימות: אותו רכיב, קו לכל רשימה ובלי ציור נרות", () => {
    const h = html({ series: two });
    expect(h).not.toContain("mk-pv");
    expect((h.match(/<path [^>]*stroke-width="2.4"/g) ?? []).length).toBe(2);
    expect(h).toContain("מקרא");
    expect(h).toContain("הליכוד");
    expect(h).toContain("יש עתיד");
  });
  it("קו 61 רק אם הגוש עבר 55", () => {
    expect(html({ majority: 61 })).not.toContain(">60</span>");
    const small = html({ series: [{ id: "s", name: "גוש קטן", points: points.map((p) => ({ ...p, v: 30, lo: 25, hi: 36, xs: [25, 30, 36] })) }], majority: 61 });
    expect(small).not.toContain(">61</span>");
  });
  it("קווים רק היכן שיש נתונים: אין קו 5 כשכל הנתונים בין 45 ל-65", () => {
    const h = html();
    expect(h).not.toContain(">5</span>");
    expect(h).not.toContain(">100</span>");
  });
  it("גרף שאינו מסקרים (ממוצע המודל): מקרא ואחוזים, ובלי נרות", () => {
    const h = html({ series: two, unit: "אחוזים", legendEntries: [{ kind: "dot", text: "ממוצע המודל בכל יום" }] });
    expect(h).toContain("מקרא");
    expect(h).not.toContain("mk-pv");
  });
  it("הקו עובר דרך הממוצע של כל נקודה: כל קו חוצה יושב על קו המגמה", () => {
    const h = html();
    const d = /<path d="M([\d.]+)[ ,]([\d.]+)[^"]*" class="trend-line fill-none stroke-accent"/.exec(h);
    expect(d).not.toBeNull();
    const marks = [...h.matchAll(/data-kind="primary" data-side="[^"]*" style="left:([\d.]+)%;top:([\d.]+)%[^"]*" title="ממוצע: ([\d.]+)/g)];
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every(m => points.some(p => p.v === Number(m[3])))).toBe(true);
  });
  it("תוצאה בפועל: קו מקווקו מהסקר האחרון אל התוצאה, בכל סדרה לפי מזהה", () => {
    const m = [{ id: "b", t: points[9].t + 6 * DAY, v: 25 }];
    const h = html({ series: two, markers: m });
    expect((h.match(/stroke-dasharray="4 3"/g) ?? []).length).toBe(1);
    expect(html({ series: two })).not.toContain('stroke-dasharray="4 3"');
    expect(html({ markers: [{ t: points[9].t + 6 * DAY, v: 55 }] })).toContain('stroke-dasharray="4 3"');
  });
  it("הכותרת באותה שורה של כפתור המקרא: כותרת מימין, מקרא משמאל, בלי שורה ביניהם", () => {
    const h = html({ heading: createElement("h2", null, "כותרת הגרף") });
    expect(h).toMatch(/<div class="flex items-center gap-3"><div class="min-w-0 flex-1"><h2>כותרת הגרף<\/h2><\/div><button/);
  });
});
