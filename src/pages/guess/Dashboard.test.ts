import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { BlocsBlock, StatTable } from "./Dashboard";
import type { Dashboard, SeatStat } from "../../lib/crowdApi";

const stat: SeatStat = { list: "likud", n: 1, mean: 30, min: 30, max: 30, median: 30, p25: 30, p75: 30 };

it("מציג ממוצע, סקרים וההשערה שלי; טווח זהה נשאר ריק", () => {
  const html = renderToStaticMarkup(createElement(StatTable, {
    rows: [stat],
    polls: { likud: 28 },
    mine: { start: "zero", pollsAsOf: null, seats: { likud: { v: 0, src: "manual", locked: true } } },
  }));
  for (const label of ["ממוצע", "סקרים", "שלי"]) expect(html).toContain(label);
  expect(html).toContain(">0</td>");
  expect(html).toContain("<bdi dir=\"ltr\"></bdi>");
});

it("גוש הקואליציה ראשון, מציג מספר מנחשים וטווח זהה כריק", () => {
  const d: Dashboard = {
    participants: 1,
    open: true,
    publishedAt: null,
    aggregationId: null,
    blocs: { derived: { gov: stat, rest: stat }, explicit: null, customCount: 0, custom: [] },
  };
  const html = renderToStaticMarkup(createElement(StaticRouter, {
    location: "/guess",
    children: createElement(BlocsBlock, { d }),
  }));
  expect(html).toContain("גוש הקואליציה");
  expect(html).toContain("מנחשים");
  expect(html).toContain("<bdi dir=\"ltr\"></bdi>");
  for (const label of ["הימור ישיר", "שאר הרשימות", "סדרה 1"]) expect(html).not.toContain(label);
});
