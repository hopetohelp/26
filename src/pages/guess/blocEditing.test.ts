import { expect, it } from "vitest";
import { customBlocs, moveList, removeBloc } from "./blocEditing";
it("הוספה לגוש נוסף משמרת חברות קודמת ויעדים, בלי כפילות בתוך גוש", () => {
  const initial = customBlocs(["x", "y"]);
  initial[0].target = 61; initial[1].target = 80;
  const copied = moveList(initial, "x", "a");
  expect(copied.map(b => b.lists)).toEqual([["x"], ["x", "y"]]);
  expect(moveList(copied, "x", "a")[0].lists).toEqual(["x"]);
  expect(copied.map(b => b.target)).toEqual([61,80]);
  expect(initial[0].lists).toEqual([]);
  expect(moveList(copied, "x", "missing")).toBe(copied);
});
it("מחיקת תרחיש לא מעבירה מפלגות ולא משנה תרחיש אחר", () => {
  const initial = moveList(customBlocs(["x", "y"]), "x", "a");
  expect(removeBloc(initial, "a")).toEqual([initial[1]]);
  expect(initial).toHaveLength(2);
});
