import { expect, it } from "vitest";
import { votingRows } from "./votingRows";
import type { Dashboard } from "../../lib/crowdApi";
it("מציג רק רשימות שנבחרו על ידי משתתפים בעבר או בעתיד", () => {
  const d: Dashboard = { participants: 2, publishedAt: null, aggregationId: null, open: true, vote2022: { all: { "מחל": {n:1,of:2}, none:{n:1,of:2} }, valid:{}, official:{} }, vote2026:{all:{likud:{n:2,of:2}},named:{}} };
  const rows=votingRows(d);
  expect(rows.find(r=>r.key==="likud")).toMatchObject({previous:50,next:100,official:23.41});
  expect(rows.map(r=>r.key)).toEqual(["likud"]);
  const oldOnly = votingRows({...d, vote2022:{...d.vote2022!,all:{"ט":{n:1,of:1}}}});
  expect(oldOnly.find(r=>r.key === "rzp")).toMatchObject({previous:100,next:0});
  expect(oldOnly.find(r=>r.key === "2022:ט")).toBeUndefined();
  expect(votingRows({...d,vote2026:undefined}).find(r=>r.key==="likud")?.next).toBeNull();
});
