import { nameOf } from "./model";
import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlocStats, Matrix, SeatsStats, StatTable, VoteComparison, VotingStats } from "./Dashboard";
import type { Dashboard, SeatStat } from "../../lib/crowdApi";

const stat: SeatStat = { list: "likud", n: 1, mean: 30, min: 30, max: 30, median: 30, p25: 30, p75: 30 };

it("השערת אחוזים מוצגת במנדטים בטבלה ובגרף", () => {
  for (const view of ["table", "chart"] as const) {
    const html = renderToStaticMarkup(createElement(SeatsStats, {
      rows: [stat], polls: { likud: 28 }, view,
      mine: { mode: "pct", pct: { likud: 25.5 }, start: "zero", pollsAsOf: null, seats: { likud: { v: 30, src: "manual", locked: false } } },
    }));
    expect(html).toContain("מנדטים");
    expect(html).not.toContain("אחוזים");
    expect(html).not.toContain("25.5%");
    if (view === "table") expect(html).toContain(">30</td>");
  }
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
  const fixed = ["הממשלה היוצאת", "גוש הקואליציה", "גוש האופוזיציה", "ערבים"].map((name,i) => ({id:["government","coalition","opposition","arab"][i],name,lists:["likud","shas"],stat:{...stat,mean:i,n:1}}));
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

it('גושים נוספים מסודרים לפי מספר המגדירים ואז המנדטים', () => {
  const group=(name:string,n:number,mean:number)=>({name,lists:[name],n,eligible:true,explicit:null,derived:{...stat,n:1,mean}});
  const d:Dashboard={participants:5,open:true,publishedAt:null,aggregationId:null,blocs:{derived:null,explicit:null,customCount:5,fixed:[],custom:[group('קטן',2,80),group('רבים נמוך',3,30),group('רבים גבוה',3,50)]}};
  const html=renderToStaticMarkup(createElement(BlocStats,{d,view:'table'}));
  const order=['רבים גבוה','רבים נמוך','קטן'].map(name=>html.indexOf(`>${name}</summary>`));
  expect(order.every(i=>i>=0)).toBe(true);
  expect(order).toEqual([...order].sort((a,b)=>a-b));
});


it("ממוצע הסקרים בגוש מסכם רק מפלגות עם נתון, בלי הודעת חסר", () => {
  const d: Dashboard = {participants:2,open:true,publishedAt:null,aggregationId:null,
    seats:{n:2,full:[],manual:[],filledShare:0,usedFillAll:0,pollsAsOf:null,starts:{zero:2,polls:0,k25:0},polls:{likud:23.5,shas:8,utj:0}},
    blocs:{derived:null,explicit:null,customCount:0,fixed:[{id:"coalition",name:"בדיקת סכום",lists:["likud","shas","utj","noam"],stat}]}};
  const html = renderToStaticMarkup(createElement(BlocStats,{d,view:"table"}));
  expect(html).toContain("ממוצע הסקרים");
  expect(html).toContain(">31.5</td>");
  expect(html).not.toContain("לפחות");
  expect(html).not.toContain("חסר");
});

it("ברשימה ובגרף מוצגות רק מפלגות שעברו אצל משתתף, גם כשהממוצע נמוך מארבעה", () => {
  const rows=[{...stat,list:"likud",mean:2,min:0,max:4},{...stat,list:"shas",mean:0,min:0,max:0}];
  for(const view of ["table","chart"] as const) {
    const html=renderToStaticMarkup(createElement(SeatsStats,{rows,polls:{shas:8},view}));
    expect(html).toContain(nameOf("likud"));
    expect(html).not.toContain("ש&quot;ס");
    expect(html).toContain("מפלגות שלא עברו את אחוז החסימה אצל אף משתתף לא מוצגות");
  }
  const historical=renderToStaticMarkup(createElement(SeatsStats,{rows,polls:{},view:"table",passedLists:["shas"]}));
  expect(historical).toContain("ש&quot;ס");
  expect(historical).not.toContain(nameOf("likud"));
});

it("טור שלי אינו מופיע כאשר אין נתונים אישיים להשוואה", () => {
 const html=renderToStaticMarkup(createElement(SeatsStats,{rows:[stat],polls:{},view:"table"}));
 expect(html).not.toContain('>שלי</th>');
});

it("מתג אחוז/מספר בהצבעה: מספרים בכל הטבלה, והרשמי כפול מספר המשתתפים", () => {
  const d: Dashboard = { participants: 20, open: true, publishedAt: null, aggregationId: null,
    vote2022: { all: { "מחל": { n: 4, of: 20 } }, valid: {}, official: {} }, vote2026: { all: { likud: { n: 6, of: 20 } }, named: {} } };
  const pct = renderToStaticMarkup(createElement(VoteComparison, { d, unit: "pct", participants: 20 }));
  expect(pct).toContain(">23.41%</td>");
  expect(pct).toContain(">20%</td>");
  expect(pct).toContain(">30%</td>");
  const num = renderToStaticMarkup(createElement(VoteComparison, { d, unit: "num", participants: 20 }));
  expect(num).toContain(">4.68</td>");
  expect(num).toContain(">4</td>");
  expect(num).toContain(">6</td>");
  expect(num).not.toContain("%</td>");
});

it("שורת הסיכום של המעבר: מספרים או אחוזים לפי המתג", () => {
  const cell = (n: number) => ({ n, of: 10 });
  const d: Dashboard = { participants: 10, open: true, publishedAt: null, aggregationId: null,
    matrix: { publishedAt: "", rows: { "מחל": { n: 10, cells: { likud: cell(6), shas: cell(2) } } } } };
  const num = renderToStaticMarkup(createElement(Matrix, { d, unit: "num" }));
  expect(num).toContain("<strong>6</strong>");
  expect(num).toContain("<strong>2</strong>");
  const pct = renderToStaticMarkup(createElement(Matrix, { d, unit: "pct" }));
  expect(pct).toContain("<strong>75%</strong>");
  expect(pct).toContain("<strong>25%</strong>");
});

it("גוש של חמש רשימות הממשלה בלי נעם אינו מוצג כגוש נפרד", () => {
  const stat = { n: 2, mean: 63.5, min: 63, p25: 63, median: 63.5, p75: 64, max: 64 };
  const d = { participants: 2, open: true, publishedAt: null, aggregationId: null, blocs: { derived: null, explicit: null, customCount: 2, fixed: [], custom: [{ name: "גוש 1", lists: ["likud", "otzma", "rzp", "shas", "utj"], n: 2, explicit: null, derived: stat }, { name: "גוש נוסף", lists: ["joint", "raam"], n: 2, explicit: null, derived: { ...stat, mean: 12 } }] } } as unknown as Dashboard;
  const html = renderToStaticMarkup(createElement(BlocStats, { d, view: "table" }));
  expect(html).not.toContain("גוש 1");
  expect(html).toContain("גוש נוסף");
});
