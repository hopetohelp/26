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
it("ממוצע הסקרים והטווח נגזרים מאותה רשימת סקרים, וגוש חסר אינו מושלם לפי המודל", () => {
  const polls = [poll({ likud: 20, shas: 8 }), poll({ likud: 30, shas: 10 }), poll({ likud: 40 })];
  expect(pollSeatSummary(polls, ["likud"])).toEqual({ mean: 30, range: [20, 40] });
  expect(pollSeatSummary(polls, ["likud", "shas"])).toEqual({ mean: 34, range: [28, 40] });
  expect(pollSeatSummary(polls, ["utj"])).toBeNull();
});

it("pollSeatSummary: רשימה שהסקרים לא שואלים עליה נספרת 0 בגוש", () => {
  const polls = [
    { values: { likud: { s: 30 }, shas: { s: 10 } } },
    { values: { likud: { s: 26 }, shas: { s: 8 } } },
  ] as unknown as Parameters<typeof pollSeatSummary>[0];
  expect(pollSeatSummary(polls, ["likud", "shas", "noam"], { likud: 28, shas: 9 })).toEqual({ mean: 37, range: [34, 40] });
  expect(pollSeatSummary(polls, ["likud", "shas", "utj"], { likud: 28, shas: 9, utj: 8 })).toBeNull();
  expect(pollSeatSummary(polls, ["noam"], {})).toBeNull();
});
