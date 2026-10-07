import { expect, it } from "vitest";
import { voteContinuity } from "./voteContinuity";

it("הציונות הדתית ב־2022 וזהות/הציונות הדתית ב־2026 הן אותה בחירה", () => {
  expect(voteContinuity({ publishedAt: "2026-10-07", rows: {
    "ט": { n: 3, cells: { rzp: { n: 2, of: 3 }, likud: { n: 1, of: 3 } } },
    "מחל": { n: 1, cells: { likud: { n: 1, of: 1 } } },
  } })).toEqual({ same: 3, changed: 1, total: 4 });
});

it("תשובות חסרות, פרטיות, מתלבטים ותאים מוסתרים אינם שינוי בחירה", () => {
  expect(voteContinuity({ publishedAt: "2026-10-07", rows: {
    "ט": { n: 3, cells: { undecided: { n: 1, of: 3 }, private: { n: 1, of: 3 }, rzp: { n: 1, of: 3, hidden: true } } },
    none: { n: 1, cells: { likud: { n: 1, of: 1 } } },
  } })).toEqual({ same: 0, changed: 0, total: 0 });
});
