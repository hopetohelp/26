import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BlocAvatar } from "./BlocAvatar";
import { PARTY_IMAGES } from "../lib/partyImages";
import { defaultBlocs } from "../pages/guess/model";

const imgs = (lists: string[]) => [...renderToStaticMarkup(createElement(BlocAvatar, { lists })).matchAll(/parties\/(\w+)\./g)].map((m) => m[1]);

it("מוצגות תמונות כל המפלגות שבגוש, לפי סדר הגוש", () => {
  expect(imgs(["likud", "shas", "raam"])).toEqual(["likud", "shas", "raam"]);
});

it("מפלגה בלי תמונה לא מוצגת, ומפלגה שמופיעה פעמיים מוצגת פעם אחת", () => {
  expect(imgs(["haredi_public", "code_black"])).toEqual([]);
  expect(imgs(["likud", "haredi_public", "likud"])).toEqual(["likud"]);
});

it("בכל גוש ברירת מחדל יש תמונה לפחות לאחת מהמפלגות", () => {
  for (const b of defaultBlocs()) expect(b.lists.some((id) => PARTY_IMAGES[id]), b.name).toBe(true);
});
