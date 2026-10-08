import { nameOf } from "./model";
import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlocStats, SeatsStats, StatTable, VotingStats } from "./Dashboard";
import type { Dashboard, SeatStat } from "../../lib/crowdApi";

const stat: SeatStat = { list: "likud", n: 1, mean: 30, min: 30, max: 30, median: 30, p25: 30, p75: 30 };

it("אחוזים משתמשים בניחוש האחוזים ולא מחלקים מנדטים ב־120", () => {
  const html = renderToStaticMarkup(createElement(SeatsStats, {
    rows: [{ ...stat, mean: 24.5 }], polls: { likud: 23.5 }, view: "table", unit: "pct",
    mine: { mode: "pct", pct: { likud: 25.5 }, start: "zero", pollsAsOf: null, seats: { likud: { v: 30, src: "manual", locked: false } } },
  }));
  for (const value of ["24.5%", "23.5%", "25.5%"]) expect(html).toContain(value);
  expect(html).not.toContain(">30</td>");
});

it("מציג ממוצע, סקרים וההשערה שלי; טווח זהה נשאר ריק", () => {
  const html = renderToStaticMarkup(createElement(StatTable, {
    rows: [stat],
    polls: { likud: 28 },
    mine: { start: "zero", pollsAsOf: null, seats: { likud: { v: 0, src: "manual", locked: true } } },
  }));
  for (const label of ["ממוצע", "סקרים", "שלי"]) expect(html).toContain(label);
  expect(html).toContain(">0</td>");
  expect(html).toContain("<bdi dir=\"ltr\"></bdi>");
});

it("מספר המשתתפים בכותרות נלקח מכל חלק, בטבלה ובגרף", () => {
  const d = { participants: 99, open: true, publishedAt: null, aggregationId: null,
    sectionParticipants: { blocs: 7, vote2026: 5 },
    blocs: { derived: { gov: stat, rest: stat }, explicit: null, customCount: 0 },
    vote2026: { all: {}, named: {} } };
  for (const view of ["table", "chart"] as const) {
    expect(renderToStaticMarkup(createElement(SeatsStats, { rows: [{ ...stat, n: 3 }], polls: {}, view }))).toContain("3 משתתפים");
    expect(renderToStaticMarkup(createElement(BlocStats, { d, view }))).toContain("7 משתתפים");
  }
  const html = renderToStaticMarkup(createElement(VotingStats, { d }));
  expect(html).toContain("5 משתתפים");
  expect(html).toContain("font-display");
  expect(html).not.toContain("99 משתתפים");
});

it("ארבע שורות קבועות תמיד בראש; השם פותח את רשימת המפלגות", () => {
  const fixed = ["הממשלה היוצאת", "גוש הקואליציה", "גוש האופוזיציה", "ערבים"].map((name,i) => ({id:String(i),name,lists:["likud","shas"],stat:{...stat,mean:i,n:1}}));
  const d: Dashboard = {participants:2,open:true,publishedAt:null,aggregationId:null,blocs:{derived:null,explicit:null,customCount:2,fixed,custom:[{name:"גוש נוסף",lists:["joint","raam"],n:2,explicit:null,derived:{...stat,mean:12}}]}};
  for(const view of ["table","chart"] as const) {
    const html=renderToStaticMarkup(createElement(BlocStats,{d,view}));
    const indices=[...fixed.map(g=>g.name),"גוש נוסף"].map(name=>html.indexOf(`>${name}</summary>`));
    expect(indices.every(n=>n>=0)).toBe(true);
    expect(indices).toEqual([...indices].sort((a,b)=>a-b));
    expect(html).toContain('aria-label="מפלגות הממשלה היוצאת"');
    expect(html).toContain(nameOf('likud'));
    expect(html).toContain('<details>');
  }
});
it("מסנן גושים נוספים לפי שני מגדירים, שתי מפלגות וסף לפני עיגול", () => {
  const group=(name:string,lists:string[],n:number,mean:number)=>({name,lists,n,explicit:null,derived:{...stat,n,mean}});
  const d: Dashboard = {participants:4,open:true,publishedAt:null,aggregationId:null,blocs:{derived:null,explicit:null,customCount:4,fixed:[],custom:[
    group("מגדיר יחיד",["likud","shas"],1,60), group("מפלגה יחידה",["likud"],2,60),
    group("מתחת לסף",["likud","shas"],2,7.999),group("בדיוק בסף",["joint","raam"],2,8),
  ]}};
  for(const view of ["table","chart"] as const) {
    const html=renderToStaticMarkup(createElement(BlocStats,{d,view,mine:[["likud","shas"]]}));
    expect(html).toContain('בדיוק בסף');
    for(const name of ['מגדיר יחיד','מפלגה יחידה','מתחת לסף'])expect(html).not.toContain(name);
  }
});
