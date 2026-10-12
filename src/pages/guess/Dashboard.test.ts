import { nameOf } from "./model";
import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { BlocStats, Matrix, SeatsStats, StatTable, VoteComparison, VotingStats } from "./Dashboard";
import type { Dashboard, SeatStat, SeatsPayload } from "../../lib/crowdApi";

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
  for (const label of ["משתתפים", "סקרים", "שלך"]) expect(html).toContain(label);
  expect(html).toContain(">0</td>");
  // טווח זהה: לא נכתב טווח ריק
  expect(html).not.toContain("<bdi dir=\"ltr\"></bdi>");
});

it("מספר המשתתפים בכותרות נלקח מכל חלק, בטבלה ובגרף", () => {
  const d = { participants: 99, open: true, publishedAt: null, aggregationId: null,
    sectionParticipants: { blocs: 7, vote2026: 5 },
    blocs: { derived: { gov: stat, rest: stat }, explicit: null, customCount: 0 },
    vote2026: { all: {}, named: {} } };
  for (const view of ["table", "chart"] as const) {
    expect(renderToStaticMarkup(createElement(SeatsStats, { rows: [{ ...stat, n: 3 }], polls: {}, view }))).toContain("3 משתתפים");
    // בגושים אין מספר משתתפים כללי בכותרת (הכרעת בעלים 11.10.2026): רק מספר המשתתפים בכל גוש
    expect(renderToStaticMarkup(createElement(BlocStats, { d, view }))).not.toContain("7 משתתפים");
  }
  const html = renderToStaticMarkup(createElement(VotingStats, { d }));
  expect(html).toContain("5 משתתפים");
  expect(html).toContain("font-display");
  expect(html).not.toContain("99 משתתפים");
});

it("מוצגים רק הגושים שהמשתתף הגדיר, לפי ממוצע המשתתפים; השם פותח את רשימת המפלגות", () => {
  const fixed = [{id:"coalition",name:"קבוע",lists:["likud","shas"],stat:{...stat,mean:5,n:1}}];
  const d: Dashboard = {participants:2,open:true,publishedAt:null,aggregationId:null,blocs:{derived:null,explicit:null,customCount:2,fixed,custom:[{name:"גוש נוסף",lists:["joint","raam"],n:5,explicit:null,derived:{...stat,mean:12}}]}};
  const mineBlocs = [{ name: "השני שלי", lists: ["likud", "shas"] }, { name: "הגוש שלי", lists: ["joint", "raam"] }];
  for(const view of ["table","chart"] as const) {
    const html=renderToStaticMarkup(createElement(BlocStats,{d,view,mineBlocs}));
    const indices=["הגוש שלי","השני שלי"].map(name=>html.indexOf(`>${name}</span>`));
    expect(indices.every(n=>n>=0)).toBe(true);
    expect(indices).toEqual([...indices].sort((a,b)=>a-b));
    expect(html).not.toContain("גוש נוסף");
    expect(html).not.toContain(">קבוע</span>");
    expect(html).toContain('aria-label="מפלגות הגוש שלי"');
    expect(html).toContain(nameOf('likud'));
  }
});
it("נתון של גוש מותאם נלקח רק כשחמישה מגדירים, שתי מפלגות וסף לפני עיגול; אחרת הגוש מוצג בלי נתון", () => {
  const group=(name:string,lists:string[],n:number,mean:number)=>({name,lists,n,explicit:null,derived:{...stat,n,mean}});
  const d: Dashboard = {participants:4,open:true,publishedAt:null,aggregationId:null,blocs:{derived:null,explicit:null,customCount:4,fixed:[],custom:[
    group("מגדיר יחיד",["likud","shas"],4,60), group("מתחת לסף",["joint","raam"],5,7.999),group("בדיוק בסף",["otzma","utj"],5,8),
  ]}};
  const mineBlocs=[{name:"א",lists:["likud","shas"]},{name:"ב",lists:["joint","raam"]},{name:"ג",lists:["otzma","utj"]}];
  const html=renderToStaticMarkup(createElement(BlocStats,{d,view:"table",mineBlocs}));
  const cells=[...html.matchAll(/<tbody>.*<\/tbody>/g)][0][0].split("<tr").slice(1);
  expect(cells[0]).toContain(">8<");
  expect(cells[1]).not.toContain(">60<");
  expect(cells[2]).not.toContain(">8<");
});

it("מחק הכול — מוצגת הודעה, וכפתור העריכה נשאר", () => {
  const d: Dashboard = {participants:2,open:true,publishedAt:null,aggregationId:null,blocs:{derived:null,explicit:null,customCount:0,fixed:[{id:"coalition",name:"קבוע",lists:["likud"],stat}],custom:[]}};
  const html=renderToStaticMarkup(createElement(StaticRouter,{location:"/community",children:createElement(BlocStats,{d,view:"table",mineBlocs:[],editReturnTo:"/community"})}));
  expect(html).toContain("אין לך גושים מוגדרים");
  expect(html).toContain("החלוקה לגושים");
  expect(html).not.toContain("קבוע");
});

it('בשוויון ובנתון חסר הגושים נשארים בסדר שהמשתתף הגדיר', () => {
  const d:Dashboard={participants:5,open:true,publishedAt:null,aggregationId:null,blocs:{derived:null,explicit:null,customCount:0,fixed:[],custom:[]}};
  const html=renderToStaticMarkup(createElement(BlocStats,{d,view:'table',mineBlocs:[{name:'ראשון',lists:['likud']},{name:'שני',lists:['shas']},{name:'שלישי',lists:['utj']}]}));
  const order=['ראשון','שני','שלישי'].map(name=>html.indexOf(`>${name}</span>`));
  expect(order.every(i=>i>=0)).toBe(true);
  expect(order).toEqual([...order].sort((a,b)=>a-b));
});


it("גוש שאין עליו סקר מלא מוצג בלי ממוצע סקרים משוער", () => {
  const d: Dashboard = {participants:2,open:true,publishedAt:null,aggregationId:null,
    seats:{n:2,full:[],manual:[],filledShare:0,usedFillAll:0,pollsAsOf:null,starts:{zero:2,polls:0,k25:0},polls:{likud:23.5,shas:8,utj:0}},
    blocs:{derived:null,explicit:null,customCount:0,fixed:[{id:"coalition",name:"בדיקת סכום",lists:["likud","shas","utj","noam"],stat}]}};
  const html = renderToStaticMarkup(createElement(BlocStats,{d,view:"table",mineBlocs:[{name:"סכום",lists:["likud","shas","utj","noam"]}]}));
  expect(html).toContain("סקרים");
  expect(html).not.toContain(">31.5</span>");
  expect(html).toContain('>—</span>');
  expect(html).not.toContain("לפחות");
  expect(html).not.toContain("חסר");
});

it("ברשימה ובגרף מוצגות רק מפלגות שעברו אצל משתתף, גם כשהממוצע נמוך מארבעה", () => {
  const rows=[{...stat,list:"likud",mean:2,min:0,max:4},{...stat,list:"shas",mean:0,min:0,max:0}];
  for(const view of ["table","chart"] as const) {
    const html=renderToStaticMarkup(createElement(SeatsStats,{rows,polls:{shas:8},view}));
    expect(html).toContain(nameOf("likud"));
    expect(html).not.toContain("ש&quot;ס");
    expect(html).not.toContain("מפלגות שלא עברו את אחוז החסימה אצל אף משתתף לא מוצגות");
  }
  const historical=renderToStaticMarkup(createElement(SeatsStats,{rows,polls:{},view:"table",passedLists:["shas"]}));
  expect(historical).toContain("ש&quot;ס");
  expect(historical).not.toContain(nameOf("likud"));
});

it("טור שלי אינו מופיע כאשר אין נתונים אישיים להשוואה", () => {
 const html=renderToStaticMarkup(createElement(SeatsStats,{rows:[stat],polls:{},view:"table"}));
 expect(html).not.toContain('>שלך</th>');
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

it("טבלת ההצבעה מסודרת לפי מספר המתכננים להצביע בבחירות הבאות", () => {
  const d: Dashboard = { participants: 20, open: true, publishedAt: null, aggregationId: null,
    vote2022: { all: { "מחל": { n: 10, of: 20 }, "שס": { n: 5, of: 20 } }, valid: {}, official: {} },
    vote2026: { all: { likud: { n: 3, of: 20 }, shas: { n: 9, of: 20 } }, named: {} } };
  const html = renderToStaticMarkup(createElement(VoteComparison, { d, unit: "num", participants: 20 }));
  expect(html.indexOf(nameOf("shas"))).toBeLessThan(html.indexOf(nameOf("likud")));
});

it("אחוז קטן חיובי בטבלת ההצבעה אינו מעוגל לאפס", () => {
  const d: Dashboard = { participants: 2000, open: true, publishedAt: null, aggregationId: null,
    vote2026: { all: { shas: { n: 1, of: 2000 } }, named: {} } };
  const html = renderToStaticMarkup(createElement(VoteComparison, { d, unit: "pct", participants: 2000 }));
  expect(html).toContain(">0.05%</td>");
  expect(html).not.toContain(">0.0%</td>");
});

it("שורת הסיכום של המעבר: מספרים או אחוזים לפי המתג", () => {
  const cell = (n: number) => ({ n, of: 10 });
  const d: Dashboard = { participants: 10, open: true, publishedAt: null, aggregationId: null,
    matrix: { publishedAt: "", rows: { "מחל": { n: 10, cells: { likud: cell(6), shas: cell(2) } } } } };
  const num = renderToStaticMarkup(createElement(Matrix, { d, unit: "num" }));
  expect(num).toMatch(/<strong>\d+\/\d+<\/strong> מהמצביעים בבחירות קודמות עברו מפלגה/);
  expect(num).not.toContain("נשארו באותה רשימה");
  expect(num).not.toContain("התפצלה");
  const pct = renderToStaticMarkup(createElement(Matrix, { d, unit: "pct" }));
  expect(pct).toMatch(/<strong>\d+(\.\d+)?%<\/strong> מהמצביעים בבחירות קודמות עברו מפלגה/);
});

it("טבלת המעבר: שורות לפי מספר הבוחרים בתשובה בבחירות קודמות, וטורים לפי מספר הבוחרים בה לבחירות הבאות", () => {
  const cell = (n: number) => ({ n, of: 20 });
  const d: Dashboard = { participants: 20, open: true, publishedAt: null, aggregationId: null,
    vote2026: { all: { likud: cell(3), shas: cell(9) }, valid: {}, official: {} },
    matrix: { publishedAt: "", rows: { "ש": { n: 4, cells: { likud: cell(1), shas: cell(3) } }, "מחל": { n: 12, cells: { likud: cell(2), shas: cell(6) } } } } } as unknown as Dashboard;
  const html = renderToStaticMarkup(createElement(Matrix, { d, unit: "num" }));
  expect(html.indexOf(">מחל<")).toBeLessThan(html.indexOf(">ש<"));
  expect(html.indexOf(nameOf("shas"))).toBeLessThan(html.indexOf(nameOf("likud")));
});

it("גוש של חמש רשימות הממשלה בלי נעם מוצג כשהמשתתף הגדיר אותו", () => {
  const stat = { n: 2, mean: 63.5, min: 63, p25: 63, median: 63.5, p75: 64, max: 64 };
  const d = { participants: 2, open: true, publishedAt: null, aggregationId: null, blocs: { derived: null, explicit: null, customCount: 1, fixed: [], custom: [{ name: "גוש 1", lists: ["likud", "otzma", "rzp", "shas", "utj"], n: 6, eligible: true, explicit: null, derived: stat }] } } as unknown as Dashboard;
  const html = renderToStaticMarkup(createElement(BlocStats, { d, view: "table", mineBlocs: [{ name: "שלי", lists: ["likud", "otzma", "rzp", "shas", "utj"] }] }));
  expect(html).toContain("שלי");
  expect(html).toContain(">63.5<");
});

it("גוש שהגדרתם בלי נתוני משתתפים מוצג עם סכום המנדטים שלך", () => {
  const d: Dashboard = {participants:2,open:true,publishedAt:null,aggregationId:null,blocs:{derived:null,explicit:null,customCount:0,fixed:[{id:"coalition",name:"קבוע",lists:["likud"],stat}],custom:[]}};
  const mineSeats = { start: "zero", pollsAsOf: null, seats: { shas: { v: 7, src: "manual", locked: false }, utj: { v: 5, src: "manual", locked: false }, likud: { v: 30, src: "manual", locked: false } } } as SeatsPayload;
  const html = renderToStaticMarkup(createElement(BlocStats, { d, view: "table", mineSeats, mineBlocs: [{ name: "החרדים", lists: ["shas", "utj"] }] }));
  expect(html).toContain("החרדים");
  expect(html).toContain(">12</td>");
  expect(html).not.toContain("קבוע");
  expect(html).toContain(">שלך</th>");
});

it("בטבלאות המפלגות והגוש: טור אחד לסקרים וטור אחד למשתתפים, בכל תא ממוצע וטווח (מתחת בטלפון, ליד במסך רחב)", () => {
  const spread = { ...stat, mean: 27.8, min: 19, max: 35 };
  const html = renderToStaticMarkup(createElement(SeatsStats, { rows: [spread], polls: { likud: 23 }, view: "table" }));
  expect(html.match(/<th class="font-normal">/g)?.length).toBe(2);
  expect(html).not.toContain(">טווח</th>");
  expect(html).toContain("flex-col");
  expect(html).toContain("sm:flex-row");
  expect(html).toContain("text-base");
  expect(html).toContain("text-xs");
  expect(html).toContain("19–35");
});
