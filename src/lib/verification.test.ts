import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StaticRouter } from "react-router-dom/server";
import { PersonalBlocsProvider } from "../components/PersonalBlocs";
import Polls from "../pages/Polls";
import { polls, verificationLabel, VERIFICATION_LABEL } from "./data";

it("כל סטטוס בנתוני הסקרים הנוכחיים מקבל תיאור", () => {
  for (const poll of polls) if (poll.verification) expect(VERIFICATION_LABEL[poll.verification.status]).toBeDefined();
  expect(verificationLabel("secondary")).toEqual({ text: "מקור משני", tone: "neutral" });
});

// תוויות האימות עברו לנתונים המלאים שנפתחים בלחיצה (הכרעת בעלים 03.11.2026) — במצב סגור בודקים שהארכיון מוצג, והתווית נבדקת בפונקציה
it("ארכיון הסקרים הנוכחי מוצג בלי קריסה, כולל מקורות משניים", () => {
  expect(renderToStaticMarkup(createElement(StaticRouter, { location: "/polls", children: createElement(PersonalBlocsProvider, { children: createElement(Polls) }) }))).toContain("כל הסקרים");
  expect(polls.some(p => p.verification && verificationLabel(p.verification.status).text === "מקור משני")).toBe(true);
});

it("סטטוס חדש אינו משבית את הארכיון או מוצג כאימות מלא", () => {
  expect(verificationLabel("future-source-status")).toEqual({ text: "טרם הושלם האימות", tone: "neutral" });
  const poll = polls.find(p => p.verification)!;
  const original = poll.verification!;
  try {
    poll.verification = { ...original, status: "future-source-status" as typeof original.status };
    expect(renderToStaticMarkup(createElement(StaticRouter, { location: "/polls", children: createElement(PersonalBlocsProvider, { children: createElement(Polls) }) }))).toContain("כל הסקרים");
  } finally { poll.verification = original; }
});
