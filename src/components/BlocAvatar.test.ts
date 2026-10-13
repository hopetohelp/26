import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BlocAvatar, fitCount, leadsOf } from "./BlocAvatar";
import { PARTY_IMAGES } from "../lib/partyImages";
import { SIMPLE_POLL_MEANS } from "../lib/dataResolver";
import { defaultBlocs } from "../pages/guess/model";

/** [מפלגה, קוטר בפיקסלים] לפי סדר הציור */
const shown = (lists: string[], id?: string) => [...renderToStaticMarkup(createElement(BlocAvatar, { id, lists })).matchAll(/width:(\d+)px;height:\d+px"[^>]*><img[^>]*parties\/(\w+)\./g)].map((m) => [m[2], +m[1]]);
const lists = (id: string) => defaultBlocs().find((b) => b.id === id)!.lists;

it("גוש ברירת מחדל: המנהיגים הקבועים ראשונים וגדולים פי 1.5 (36 מול 24), ואחריהם שאר המפלגות בלי כפילות", () => {
  expect(shown(lists("government"), "government").slice(0, 2)).toEqual([["likud", 36], ["shas", 24]]);
  expect(shown(lists("gov"), "coalition")[0]).toEqual(["likud", 36]);
  expect(shown(lists("rest"), "opposition")[0]).toEqual(["yashar", 36]);
  expect(shown(lists("unity"), "unity").slice(0, 3)).toEqual([["likud", 36], ["yashar", 36], ["together", 24]]);
  expect(shown(lists("arab"), "arab")).toEqual([["raam", 36], ["joint", 24]]);
  for (const b of defaultBlocs()) { const r = shown(b.lists, b.id).map((x) => x[0]); expect(new Set(r).size, b.name).toBe(r.length); }
});

it("גוש ששונה או שהמשתתף הגדיר: המפלגה הגדולה בגוש ראשונה וגדולה פי 1.5", () => {
  const seats = SIMPLE_POLL_MEANS as Record<string, number>;
  const biggest = (["shas", "likud", "raam"]).sort((a, b) => (seats[b] ?? 0) - (seats[a] ?? 0))[0];
  const r = shown(["shas", "likud", "raam"], "my-bloc");
  expect(r[0]).toEqual([biggest, 36]);
  expect(r.slice(1).every((x) => x[1] === 24)).toBe(true);
  expect(shown(["joint"], "arab")).toEqual([["joint", 36]]); // הגוש ברירת המחדל ששונה: אין מנהיג קבוע
  expect(leadsOf("arab", ["joint"])).toEqual(["joint"]);
});

it("הגדולה בגוש נקבעת לפי ממוצע המשתתפים; בלעדיו, לפי ממוצע הסקרים", () => {
  expect(leadsOf("my", ["shas", "likud", "raam"], { shas: 30, likud: 10, raam: 5 })).toEqual(["shas"]);
  expect(leadsOf("my", ["shas", "likud", "raam"], { shas: 3, likud: 10, raam: 5 })).toEqual(["likud"]);
  expect(leadsOf("my", ["haredi_public", "raam"], { haredi_public: 99, raam: 1 })).toEqual(["raam"]); // בלי תמונה לא מנהיגה
  expect(leadsOf("unity", lists("unity"), { together: 99 })).toEqual(["likud", "yashar"]); // גוש ברירת מחדל: מנהיגים קבועים
});

it("מפלגה בלי תמונה לא מוצגת", () => {
  expect(shown(["haredi_public", "code_black"])).toEqual([]);
  expect(shown(["likud", "haredi_public", "likud"])).toEqual([["likud", 36]]);
});

it("הראשון על כולם: z-index יורד מימין לשמאל", () => {
  const html = renderToStaticMarkup(createElement(BlocAvatar, { id: "unity", lists: lists("unity") }));
  const z = [...html.matchAll(/z-index:(\d+)/g)].map((m) => +m[1]);
  expect(z.length).toBeGreaterThan(2);
  expect(z).toEqual([...z].sort((a, b) => b - a));
});

it("רוחב: כולם נכנסים כשיש מקום; אחרת המנהיגים תמיד, ומקום ל-+N", () => {
  const w = [36, 24, 24, 24, 24];
  expect(fitCount(w, 1000, 1, 24)).toBe(5);
  expect(fitCount(w, 10, 1, 24)).toBe(1);        // אין מקום: המנהיג נשאר בכל זאת
  expect(fitCount(w, 100, 1, 24)).toBeLessThan(5);
  expect(fitCount([36, 36, 24, 24], 20, 2, 24)).toBe(2); // שני מנהיגים תמיד
});

it("בכל גוש ברירת מחדל יש תמונה לפחות לאחת מהמפלגות", () => {
  for (const b of defaultBlocs()) expect(b.lists.some((id) => PARTY_IMAGES[id]), b.name).toBe(true);
});
