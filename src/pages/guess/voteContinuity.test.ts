import { expect, it } from "vitest";
import { voteContinuity } from "./voteContinuity";

it("מעבר מרשימה משותפת למפלגה מתוכה הוא פיצול, לא אותה רשימה", () => {
  expect(voteContinuity({ publishedAt: "2026-10-07", rows: {
    "ט": { n: 3, cells: { rzp: { n: 2, of: 3 }, likud: { n: 1, of: 3 } } },
    "מחל": { n: 1, cells: { likud: { n: 1, of: 1 } } },
  } })).toEqual({ same: 1, changed: 1, split: 2, total: 4 });
});

it("תשובות חסרות, פרטיות, מתלבטים ותאים מוסתרים אינם שינוי בחירה", () => {
  expect(voteContinuity({ publishedAt: "2026-10-07", rows: {
    "ט": { n: 3, cells: { undecided: { n: 1, of: 3 }, private: { n: 1, of: 3 }, rzp: { n: 1, of: 3, hidden: true } } },
    none: { n: 1, cells: { likud: { n: 1, of: 1 } } },
  } })).toEqual({ same: 0, changed: 0, split: 0, total: 0 });
});

it("ש״ס נשארת אותה רשימה; הציונות הדתית–עוצמה–נעם עוברת לעוצמה", () => {
  expect(voteContinuity({publishedAt:"2026-10-09",rows:{"שס":{n:1,cells:{shas:{n:1,of:1}}},"ט":{n:1,cells:{otzma:{n:1,of:1}}}}})).toEqual({same:1,changed:0,split:1,total:2});
});
