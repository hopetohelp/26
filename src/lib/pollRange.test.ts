import { expect, it } from "vitest";
import { pollSeatRange, pollSeatSummary } from "./pollRange";
import type { Poll } from "./data";

const poll = (s: Record<string, number | undefined>) => ({ values: Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { s: v }])) }) as unknown as Poll;

it("טווח הסקרים של מפלגה: הנמוך והגבוה בין המכונים", () => {
  expect(pollSeatRange([poll({ likud: 20 }), poll({ likud: 31 }), poll({ likud: 25 })], ["likud"], { likud: 25 })).toEqual([20, 31]);
});
it("טווח של גוש: סכום הרשימות בכל סקר; סקר שחסרה בו רשימה גדולה לא נספר", () => {
  const polls = [poll({ likud: 20, shas: 8 }), poll({ likud: 30, shas: 9 }), poll({ likud: 40 })];
  expect(pollSeatRange(polls, ["likud", "shas"], { likud: 30, shas: 8 })).toEqual([28, 39]);
});
it("רשימה שבממוצע מתחת לסף ולא נשאלה נחשבת אפס; בלי סקרים — אין טווח", () => {
  expect(pollSeatRange([poll({ likud: 20 })], ["likud", "noam"], { likud: 20 })).toEqual([20, 20]);
  expect(pollSeatRange([], ["likud"], { likud: 20 })).toBeNull();
});
it("ממוצע הסקרים והטווח נגזרים מאותה רשימת סקרים; רשימה שנשאלת בפחות מחצי מהסקרים היא חסרה ולא מושלמת בפרטי המודל", () => {
  const polls = [poll({ likud: 20, shas: 8 }), poll({ likud: 30, shas: 10 }), poll({ likud: 40 })];
  expect(pollSeatSummary(polls, ["likud"])).toEqual({ mean: 30, range: [20, 40], listed: 1, total: 1 });
  expect(pollSeatSummary(polls, ["likud", "shas"])).toEqual({ mean: 34, range: [28, 40], listed: 2, total: 2 });
  expect(pollSeatSummary(polls, ["utj"])).toBeNull();
});
it("נתון שחסר לא מסתיר את הכולל: גוש עם רשימה שהסקרים לא שואלים עליה נספר 'לפחות', עם כמה מתוך כמה", () => {
  const polls = [poll({ likud: 30, shas: 10 }), poll({ likud: 26, shas: 8 })];
  expect(pollSeatSummary(polls, ["likud", "shas", "noam"])).toEqual({ mean: 37, range: [34, 40], listed: 2, total: 3 });
  expect(pollSeatSummary(polls, ["noam"])).toBeNull();
});
