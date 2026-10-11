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
  it("כפתור מקרא בפינה הימנית העליונה (צמוד להתחלה, ימין בעברית), סגור כברירת מחדל", () => {
    const h = html();
    expect(h).toMatch(/<button[^>]*aria-expanded="false"[^>]*me-auto[^>]*>/);
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
  it("נר לכל נקודה (3 דרגות עובי מהאחוזונים): SVG לכל נר", () => {
    expect((html().match(/class="mk-pv"/g) ?? []).length).toBe(points.length);
  });
  it("תוצאה בפועל: עיגול ריק", () => {
    expect(html({ markers: [{ t: points[9].t + 3 * DAY, v: 55 }] })).toContain("mk-ring");
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
});
