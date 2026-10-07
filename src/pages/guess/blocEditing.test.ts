import { expect, it } from "vitest";
import { customBlocs, moveList, removeBloc } from "./blocEditing";
it("מתחיל עם כל המפלגות בב׳ ומעביר בלי כפילות או שינוי יעדים", () => {
  const initial = customBlocs(["x", "y"]);
  initial[0].target = 60; initial[1].target = 60;
  const moved = moveList(initial,"x","a");
  expect(moved.map(b=>b.lists)).toEqual([["x"],["y"]]);
  expect(moved.map(b=>b.target)).toEqual([60,60]);
  expect(initial[1].lists).toEqual(["x","y"]);
  expect(moveList(moved,"x","missing")).toBe(moved);
});
it("הסרה מעבירה את כל המפלגות ליעד ושומרת על היעד המספרי שלו", () => {
  const initial = moveList(customBlocs(["x","y"]),"x","a");
  initial.push({id:"c",name:"גוש ג",lists:[],target:null});
  const result = removeBloc(initial,"b","c");
  expect(result.map(b=>b.lists)).toEqual([["x"],["y"]]);
  expect(result[1].target).toBeNull();
  expect(removeBloc(initial,"a","a")).toBe(initial);
});
