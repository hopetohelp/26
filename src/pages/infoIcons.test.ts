import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import Home from "./Home";
import { DUMBBELL_LEGEND } from "../components/dumbbellChart";
import { MODEL_NOTE } from "../components/InfoTip";

/** כללי הבעלים 12.10.2026: אין שני אייקוני מידע זהים במסך, ובגרף עם "מקרא" ההסבר בתוך המקרא */
it("מסך הבית: כל אייקון מידע מופיע פעם אחת בלבד", () => {
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: "/", children: createElement(Home) }));
  const labels = [...html.matchAll(/aria-label="(הסבר:[^"]+)"/g)].map((m) => m[1]);
  expect(labels).not.toContain("הסבר: ממוצע המודל");
  expect(html).not.toContain("מהתרחישים עוברת");
  expect(html).toContain("ממוצע סקרים");
  expect(new Set(labels).size).toBe(labels.length);
  // מגמת הממשלה (גרף עם מקרא) — בלי אייקון נפרד
  expect(labels).not.toContain("הסבר: ממוצע המודל בגרף");
});

it("\"מה השתנה\": ההסבר על ממוצע המודל בתוך המקרא של הגרף", () => {
  expect(DUMBBELL_LEGEND.some((e) => typeof e.text === "string" && e.text.includes(MODEL_NOTE))).toBe(true);
});
