import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionContent } from "./History";
import type { Version } from "../../lib/crowdApi";
const html = (unit:Version["unit"],payload:Version["payload"]) => renderToStaticMarkup(createElement(VersionContent,{version:{id:1,unit,payload,created_at:"2026-10-07T10:00:00Z"}}));
it("מציג תוכן מקורי של מנדטים, אחוזים, גושים והצבעה", () => {
  expect(html("seats",{start:"zero",pollsAsOf:null,mode:"pct",pct:{likud:23.4},seats:{likud:{v:30,src:"manual",locked:true}}})).toContain("23.4%");
  const blocs=html("blocs",{mode:"custom",blocs:[{id:"a",name:"השם המקורי",lists:["likud"],target:0}]});
  expect(blocs).toContain("השם המקורי"); expect(blocs).toContain("0 מנדטים");
  expect(html("vote",{v2022:"none",v2026:"undecided"})).toContain("עוד לא החלטתי");
});
