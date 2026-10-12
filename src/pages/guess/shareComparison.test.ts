import { expect, it } from "vitest";
import { shareBlocRows, sumShareBloc } from "./shareComparison";

it("משווה שלושה מקורות באותו הרכב, בלי לחבר גושים חופפים ובלי להשתמש ביעד", () => {
  const rows = shareBlocRows([
    {name:"א", lists:["a","b"], total:99}, {name:"ב", lists:["b","c"], total:99},
  ], {a:30,b:40,c:20}, {a:25,b:35,c:30}, {a:28,b:38,c:24});
  expect(rows.map(({name,mine,polls,forecast})=>({name,mine,polls,forecast}))).toEqual([
    {name:"א",mine:70,polls:60,forecast:66}, {name:"ב",mine:60,polls:65,forecast:62},
  ]);
});
it("מפלגה בלי נתון נספרת 0; בלי נתון לאף מפלגה — אין סכום; תחזית לא זמינה נשארת חסרה", () => {
  expect(sumShareBloc(["a","b"], {a:30})).toBe(30);
  expect(sumShareBloc(["a","b"], {c:30})).toBeNull();
  expect(sumShareBloc(["a","b"], {a:30,b:0})).toBe(30);
  expect(sumShareBloc(["a","a"], {a:30})).toBe(30);
  const row=shareBlocRows([{name:"א",lists:["a","b"],total:30}],{a:30,b:0},{a:20},null)[0];
  expect(row.mine).toBe(30);expect(row.polls).toBe(20);expect(row.forecast).toBeNull();
});

it("שיתוף: מפלגה שאין עליה נתון בסקרים נספרת 0 בלי סימון", () => {
  const row=shareBlocRows([{name:"א",lists:["a","b"],total:120}],{a:80,b:40},{a:30},{a:32,b:0})[0];
  expect(row.polls).toBe(30);expect(row.forecast).toBe(32);expect(row.mine).toBe(120);
});
