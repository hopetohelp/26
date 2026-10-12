import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminGroups from "./AdminGroups";
import { groupInviteMessage } from "../lib/groupMessage";

it("מגירת הקבוצות במסך הניהול כוללת את ההודעה למנהלים וכפתור העתקה", () => {
  const html = renderToStaticMarkup(createElement(AdminGroups, { api: async () => ({ groups: [] }) }));
  expect(html).toContain("הודעה למנהלי קבוצות");
  expect(html).toContain("העתקת ההודעה");
  expect(html).toContain("הקבוצה שלכם");
  expect(html).toContain("&quot;סקר האתר&quot;");
  expect(groupInviteMessage()).toContain('"סקר האתר"');
});
