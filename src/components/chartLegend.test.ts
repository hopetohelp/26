import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChartLegend, { LegendPanel, type LegendKind } from "./ChartLegend";
import DeviationChart from "./deviationChart";
import DumbbellChart from "./dumbbellChart";
import { TrendChart } from "./charts";
import { GovTrend, Hemicycle, PollRanges, Ranking } from "./homeCharts";
import { SeatsStats } from "../pages/guess/Dashboard";
import { HOME } from "../lib/homeData";
import type { DevInput } from "../lib/deviation";

const dev: DevInput[] = [{ id: "a", name: "א", estimate: 8.5, min: 8, max: 9, actual: 11, n: 3, values: [8, 9, 9] }];
const rows = [{ id: "a", name: "א", before: 10, now: 12, from: "א", hist: { start: 11, step: 0.25, counts: [1, 3, 1] }, range: [11, 11.75] as [number, number] }];
const series = [{ id: "a", name: "א", points: [{ t: 0, v: 5, lo: 4, hi: 6, n: 3, xs: [4, 5, 6] }, { t: 86_400_000 * 10, v: 6, lo: 5, hi: 7, n: 3, xs: [5, 6, 7] }] }];
const stat = { list: "likud", n: 3, mean: 30, min: 25, max: 35, median: 30, p25: 28, p75: 32 };

describe("כפתור מקרא ליד כל גרף (הכרעת בעלים 9.10.2026)", () => {
  const charts: [string, () => string][] = [
    ["לוח המושבים", () => renderToStaticMarkup(createElement(Hemicycle, { gov: 52, other: 68 }))],
    ["הדירוג (בית, המצב היום, תרחישים)", () => renderToStaticMarkup(createElement(Ranking, { home: HOME }))],
    ["סיכום המכונים", () => renderToStaticMarkup(createElement(PollRanges, { rows: [{ id: "a", name: "א", central: 10, values: [9, 10, 11] }] }))],
    ["מגמת הממשלה היוצאת", () => renderToStaticMarkup(createElement(GovTrend, { home: HOME }))],
    ["גרף מגמה (קו ונרות)", () => renderToStaticMarkup(createElement(TrendChart, { series, from: 0, to: 86_400_000 * 10, yMax: 10, title: "מגמה", windowText: { days: 7, label: "7 הימים" } }))],
    ["הסקרים מול התוצאות", () => renderToStaticMarkup(createElement(DeviationChart, { rows: dev }))],
    ["מה השתנה", () => renderToStaticMarkup(createElement(DumbbellChart, { rows }))],
    ["סקר האתר", () => renderToStaticMarkup(createElement(SeatsStats, { rows: [stat], polls: { likud: 29 }, view: "chart" }))],
  ];
  for (const [name, render] of charts) {
    it(`${name}: יש כפתור "מקרא" סגור, והמקרא הישן לא מוצג בשורה`, () => {
      const html = render();
      expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>מקרא/);
      expect(html).not.toContain("עובי הנר:");
    });
  }
  it("בסקר האתר אין מעוין: ממוצע הגולשים הוא עיגול תוצאה (טבעת)", () => {
    const html = renderToStaticMarkup(createElement(SeatsStats, { rows: [stat], polls: { likud: 29 }, view: "chart" }));
    expect(html).not.toContain("mk-dia");
    expect(html).toContain("mk-ring");
    expect(html).toContain("mk-mean");
  });
});

describe("ChartLegend", () => {
  const entries = [{ kind: "mean" as const, text: "ממוצע בדיקה" }, { kind: "candle" as const, text: "טווח בדיקה" }];

  it("סגור כברירת מחדל: רק הכפתור, בלי ההסברים", () => {
    const html = renderToStaticMarkup(createElement(ChartLegend, { entries }));
    expect(html).toContain("מקרא");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("ממוצע בדיקה");
  });
  it("הפקד של הגרף (action) יושב בשורה אחת עם הכפתור", () => {
    const html = renderToStaticMarkup(createElement(ChartLegend, { entries, action: createElement("i", { id: "act" }) }));
    expect(html.indexOf("מקרא")).toBeLessThan(html.indexOf('id="act"'));
  });
  it("הפאנל הפתוח מסביר כל סימון, ואת שלוש רמות העובי בעובי האמיתי שלהן", () => {
    const html = renderToStaticMarkup(createElement(LegendPanel, { entries, thickness: "כמה תרחישים" }));
    for (const t of ["ממוצע בדיקה", "טווח בדיקה", "כמה תרחישים", "דק", "בינוני", "עבה"]) expect(html).toContain(t);
    for (const c of ["mk-c1", "mk-c3", "mk-c5"]) expect(html).toContain(c);
    expect(html).not.toContain("mk-c2");
    expect(html).not.toContain("mk-c4");
  });
  it("בלי thickness אין הסבר על עובי", () => {
    expect(renderToStaticMarkup(createElement(LegendPanel, { entries }))).not.toContain("עובי הנר");
  });
  it("כל סוגי הדוגמיות מצוירים", () => {
    const kinds: LegendKind[] = ["candle", "mean", "result", "dot", "line", "lineList", "dash", "pass", "seatGov", "seatMiss", "seatOther"];
    const html = renderToStaticMarkup(createElement(LegendPanel, { entries: kinds.map((kind) => ({ kind, text: kind })) }));
    for (const k of kinds) expect(html).toContain(`>${k}<`);
    expect(html).toContain("mk-prof-sw");
    expect(html).toContain("sw-miss");
  });
});
