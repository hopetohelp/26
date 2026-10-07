import { expect, it } from "vitest";
import { votingRows } from "./votingRows";
import type { Dashboard } from "../../lib/crowdApi";
import { IDS, K25_LISTS } from "./model";
it("מציג את כל הרשימות עם אפס אמיתי, חסר נפרד וללא איחוד הרכבים שונים", () => {
  const d: Dashboard = { participants: 2, publishedAt: null, aggregationId: null, open: true, vote2022: { all: { "מחל": {n:1,of:2}, none:{n:1,of:2} }, valid:{}, official:{} }, vote2026:{all:{likud:{n:2,of:2}},named:{}} };
  const rows=votingRows(d);
  expect(rows.find(r=>r.key==="likud")).toMatchObject({previous:50,next:100,official:23.41});
  expect(rows.find(r=>r.key==="shas")).toMatchObject({previous:0,next:0});
  expect(rows.find(r=>r.key==="2022:ט")).toMatchObject({next:null});
  expect(IDS.every(id=>rows.some(r=>r.key===id))).toBe(true);
  expect(rows.length).toBeGreaterThan(K25_LISTS.length);
  expect(votingRows({...d,vote2026:undefined}).find(r=>r.key==="likud")?.next).toBeNull();
});
