import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BlocAvatar } from "./BlocAvatar";
import { PARTY_IMAGES } from "../lib/partyImages";
import { defaultBlocs } from "../pages/guess/model";

const imgs = (lists: string[], id?: string) => [...renderToStaticMarkup(createElement(BlocAvatar, { id, lists })).matchAll(/parties\/(\w+)\./g)].map((m) => m[1]);
const lists = (id: string) => defaultBlocs().find((b) => b.id === id)!.lists;

it("גוש ברירת מחדל: התמונות הקבועות קודם (נתניהו, איזנקוט, שניהם, עבאס), ואחריהן שאר המפלגות בלי כפילות", () => {
  expect(imgs(lists("government"), "government").slice(0, 2)).toEqual(["likud", "shas"]);
  expect(imgs(lists("gov"), "gov")[0]).toBe("likud");
  expect(imgs(lists("gov"), "coalition")[0]).toBe("likud");
  expect(imgs(lists("rest"), "rest")[0]).toBe("yashar");
  expect(imgs(lists("rest"), "opposition")[0]).toBe("yashar");
  expect(imgs(lists("unity"), "unity").slice(0, 3)).toEqual(["likud", "yashar", "together"]);
  expect(imgs(lists("arab"), "arab")).toEqual(["raam", "joint"]);
  for (const b of defaultBlocs()) { const r = imgs(b.lists, b.id); expect(new Set(r).size, b.name).toBe(r.length); }
});

it("גוש ששונה או גוש אישי: ההרכב בפועל, בלי תמונות קבועות", () => {
  expect(imgs(["joint", "raam"], "arab")).toEqual(["raam", "joint"]); // אותו הרכב
  expect(imgs(["joint"], "arab")).toEqual(["joint"]);
  expect(imgs(["shas", "likud"], "my-bloc")).toEqual(["shas", "likud"]);
});

it("מפלגה בלי תמונה לא מוצגת", () => {
  expect(imgs(["haredi_public", "code_black"])).toEqual([]);
  expect(imgs(["likud", "haredi_public", "likud"])).toEqual(["likud"]);
});

it("בכל גוש ברירת מחדל יש תמונה לפחות לאחת מהמפלגות", () => {
  for (const b of defaultBlocs()) expect(b.lists.some((id) => PARTY_IMAGES[id]), b.name).toBe(true);
});
