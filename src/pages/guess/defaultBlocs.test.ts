import { expect, it } from "vitest";
import { defaultBlocs, IDS } from "./model";
import { moveList } from "./blocEditing";

it("ארבעה גושים בברירת המחדל וכל מפלגה משויכת בדיוק פעם אחת", () => {
  const blocs = defaultBlocs();
  expect(blocs.map(b => b.id)).toEqual(["coalition", "opposition", "arabs", "new"]);
  expect(blocs.flatMap(b => b.lists).sort()).toEqual([...IDS].sort());
  expect(blocs.map(b => b.name)).toEqual(["הקואליציה הנוכחית", "האופוזיציה הנוכחית", "ערבים", "חדשות"]);
  const moved = moveList(blocs, blocs[0].lists[0], "opposition");
  expect(moved.map(b => b.name)).toEqual(blocs.map(b => b.name));
  expect(moved.flatMap(b => b.lists).sort()).toEqual([...IDS].sort());
});
