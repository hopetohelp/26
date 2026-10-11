import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { defaultBlocs } from "../pages/guess/model";
import { BlocAvatar } from "./BlocAvatar";

const html = (id: string, lists?: string[]) => renderToStaticMarkup(createElement(BlocAvatar, { id, lists }));
const imgs = (h: string) => [...h.matchAll(/parties\/(\w+)\./g)].map((m) => m[1]);
const lists = (id: string) => defaultBlocs().find((b) => b.id === id)!.lists;

it("גושי ברירת המחדל: נתניהו לממשלה ולקואליציה, איזנקוט לאופוזיציה, שניהם באחדות, עבאס למפלגות הערביות", () => {
  expect(imgs(html("government", lists("government")))).toEqual(["likud"]);
  expect(imgs(html("gov", lists("gov")))).toEqual(["likud"]);
  expect(imgs(html("coalition", lists("gov")))).toEqual(["likud"]);
  expect(imgs(html("rest", lists("rest")))).toEqual(["yashar"]);
  expect(imgs(html("opposition", lists("rest")))).toEqual(["yashar"]);
  expect(imgs(html("unity", lists("unity")))).toEqual(["likud", "yashar"]);
  expect(imgs(html("arab", lists("arab")))).toEqual(["raam"]);
});

it("גוש שהמשתתף שינה את הרכבו, או גוש אישי, אינו מציג תמונה", () => {
  expect(html("arab", ["joint"])).toBe("");
  expect(html("my-own-bloc", ["likud"])).toBe("");
});
