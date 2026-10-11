import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CandleTrend from "./CandleTrend";

const DAY = 86_400_000;
const points = Array.from({ length: 10 }, (_, i) => ({ t: Date.UTC(2026, 8, 9) + i * 3 * DAY, v: 52 + (i % 3), lo: 46, hi: 64, n: 9, xs: [46, 49, 50, 51, 52, 53, 55, 60, 64] }));
const html = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(CandleTrend, { title: "בדיקה", points, ...props }));

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
});
