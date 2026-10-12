import { expect, it } from "vitest";
import { pollSeatRange, pollSeatSummary } from "./pollRange";
import { groupSeatsIn, type Poll } from "./data";

const poll = (s: Record<string, number | undefined>) => ({ values: Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { s: v }])) }) as unknown as Poll;

it("טווח הסקרים של מפלגה: הנמוך והגבוה בין המכונים", () => {
  expect(pollSeatRange([poll({ likud: 20 }), poll({ likud: 31 }), poll({ likud: 25 })], ["likud"])).toEqual([20, 31]);
});
it("הכלל האחד: סקר שסקר לפחות מפלגה אחת מהגוש נכנס, ומפלגה שלא נסקרה נספרת 0", () => {
  const polls = [poll({ likud: 20, shas: 8 }), poll({ likud: 30, shas: 9 }), poll({ likud: 40 })];
  expect(pollSeatRange(polls, ["likud", "shas"])).toEqual([28, 40]);
  expect(groupSeatsIn(polls[2], ["likud", "shas"])).toBe(40);
});
it("סקר שלא סקר אף מפלגה מהגוש אינו נכנס; בלי סקרים — אין טווח", () => {
  expect(pollSeatRange([poll({ likud: 20 }), poll({ shas: 8 })], ["shas"])).toEqual([8, 8]);
  expect(pollSeatRange([], ["likud"])).toBeNull();
  expect(pollSeatSummary([poll({ likud: 20 })], ["utj"])).toBeNull();
});
it("ממוצע הסקרים והטווח נגזרים מאותה רשימת סקרים, בלי סימון חסר", () => {
  const polls = [poll({ likud: 20, shas: 8 }), poll({ likud: 30, shas: 10 }), poll({ likud: 40 })];
  expect(pollSeatSummary(polls, ["likud"])).toEqual({ mean: 30, range: [20, 40] });
  expect(pollSeatSummary(polls, ["likud", "shas"])).toEqual({ mean: (28 + 40 + 40) / 3, range: [28, 40] });
});
it("גוש עם רשימה שהסקרים לא שואלים עליה (נעם): הסקרים נכנסים והיא נספרת 0", () => {
  const polls = [poll({ likud: 30, shas: 10 }), poll({ likud: 26, shas: 8 })];
  expect(pollSeatSummary(polls, ["likud", "shas", "noam"])).toEqual({ mean: 37, range: [34, 40] });
  expect(pollSeatSummary(polls, ["noam"])).toBeNull();
});
