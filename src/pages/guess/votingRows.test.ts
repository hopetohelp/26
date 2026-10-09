import { expect, it } from "vitest";
import { votingRows } from "./votingRows";
import type { Dashboard } from "../../lib/crowdApi";
it("מציג רק רשימות שנבחרו על ידי משתתפים בעבר או בעתיד", () => {
  const d: Dashboard = { participants: 2, publishedAt: null, aggregationId: null, open: true, vote2022: { all: { "מחל": {n:1,of:2}, none:{n:1,of:2} }, valid:{}, official:{} }, vote2026:{all:{likud:{n:2,of:2}},named:{}} };
  const rows=votingRows(d);
  expect(rows.find(r=>r.key==="likud")).toMatchObject({previous:50,next:100,official:23.41});
  expect(rows.map(r=>r.key)).toEqual(["likud","answer:none"]);
  expect(rows.find(r=>r.key==="answer:none")).toMatchObject({name:"לא הצביעו / לא מתכננים להצביע",previous:50,next:0});
  const oldOnly = votingRows({...d, vote2022:{...d.vote2022!,all:{"ט":{n:1,of:1}}}});
  expect(oldOnly.find(r=>r.key === "rzp")).toBeUndefined();
  expect(oldOnly.find(r=>r.key === "2022:ט")).toMatchObject({previous:100,next:null});
  expect(votingRows({...d,vote2026:undefined}).find(r=>r.key==="likud")?.next).toBeNull();
});

it("רשימת 2022 המשותפת אינה מיוחסת לציונות הדתית לבדה", () => {
  const d = {participants:1,open:true,publishedAt:null,aggregationId:null,vote2022:{all:{"ט":{n:1,of:1}},valid:{},official:{}},vote2026:{all:{otzma:{n:1,of:1}},named:{}}};
  const rows=votingRows(d);
  expect(rows.find(r=>r.key==="2022:ט")).toMatchObject({name:"הציונות הדתית · עוצמה יהודית · נעם (2022)",previous:100,next:null});
  expect(rows.find(r=>r.key==="otzma")).toMatchObject({previous:null,next:100});
  expect(rows.some(r=>r.key==="rzp")).toBe(false);
});

it("שורות למי שלא הצביע: רק כשיש תשובות כאלה, ובסוף הטבלה", () => {
  const base = {participants:2,open:true,publishedAt:null,aggregationId:null,vote2026:{all:{likud:{n:1,of:2},none:{n:1,of:2}},named:{}}};
  const rows = votingRows({...base,vote2022:{all:{"מחל":{n:1,of:2},ineligible:{n:1,of:2}},valid:{},official:{}}});
  expect(rows.map(r=>r.key)).toEqual(["likud","answer:none","answer:ineligible"]);
  expect(rows[1]).toMatchObject({previous:0,next:50});
  expect(rows[2]).toMatchObject({name:"לא הייתה זכות הצבעה",previous:50,next:0});
  expect(votingRows({...base,vote2022:{all:{"מחל":{n:2,of:2}},valid:{},official:{}},vote2026:{all:{likud:{n:2,of:2}},named:{}}}).some(r=>r.key.startsWith("answer:"))).toBe(false);
});
