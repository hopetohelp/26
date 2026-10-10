import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ChartLegend, { LegendPanel, rangeLine, type LegendKind } from "./ChartLegend";
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
  it("בסקר האתר אין מעוין: ממוצע המשתתפים הוא עיגול תוצאה (טבעת)", () => {
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
  it("הפאנל הפתוח מסביר כל סימון, ובלי הסבר על רמות העובי (שורה אחת בלבד, בתוך הסימון של הנר)", () => {
    const html = renderToStaticMarkup(createElement(LegendPanel, { entries: [...entries, { kind: "candle", text: rangeLine("full", "הסקרים") }] }));
    for (const t of ["ממוצע בדיקה", "טווח בדיקה", "טווח מלא - עובי הקו מראה את כמות הסקרים שנמצאים בטווח הזה"]) expect(html).toContain(t);
    for (const t of ["דק:", "בינוני:", "עבה:", "שליש", "mk-c1", "mk-c3", "mk-c5", "mk-candle"]) expect(html).not.toContain(t);
  });
  it("כל סוגי הדוגמיות מצוירים", () => {
    const kinds: LegendKind[] = ["candle", "mean", "result", "dot", "line", "lineList", "dash", "pass", "seatGov", "seatMiss", "seatOther"];
    const html = renderToStaticMarkup(createElement(LegendPanel, { entries: kinds.map((kind) => ({ kind, text: kind })) }));
    for (const k of kinds) expect(html).toContain(`>${k}<`);
    expect(html).toContain("mk-prof-sw");
    expect(html).toContain("sw-miss");
  });
});

describe("rangeLine: שורת המקרא היחידה על עובי הנר (הכרעת בעלים 9.10.2026)", () => {
  it('"טווח מלא - עובי הקו מראה את כמות … שנמצאים בטווח הזה"', () => {
    expect(rangeLine("full", "הסקרים")).toBe("טווח מלא - עובי הקו מראה את כמות הסקרים שנמצאים בטווח הזה");
  });
  it("טווח של תרחישים הוא 80%, ואפשר להוסיף חלון זמן", () => {
    expect(rangeLine("p80", "התרחישים")).toBe("טווח 80% - עובי הקו מראה את כמות התרחישים שנמצאים בטווח הזה");
    expect(rangeLine("full", "הסקרים", "ב-14 הימים האחרונים")).toBe("טווח מלא ב-14 הימים האחרונים - עובי הקו מראה את כמות הסקרים שנמצאים בטווח הזה");
  });
  it("כל גרף עם נר משתמש בשורה הזאת ואין בו הסבר רמות", () => {
    for (const f of ["homeCharts.tsx", "charts.tsx", "deviationChart.tsx", "dumbbellChart.tsx", "../pages/guess/Dashboard.tsx"]) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
      expect(src, f).toContain("rangeLine(");
      expect(src, f).not.toContain("thickness");
    }
  });
});
