import { expect, it } from "vitest";
import worker from "../index.js";
import { accountCount } from "../lib/accountCount.js";
import { fakeD1 } from "./fakeD1.js";
it("המונה הציבורי משתמש באותה ספירת חשבונות כמו הניהול, בלי פרטים אישיים", async () => {
  const DB = fakeD1();
  DB.raw.prepare("INSERT INTO participants (id,created_at) VALUES ('guest','2026-10-01'), ('registered','2026-10-02')").run();
  const r = await worker.fetch(new Request("https://crowd.internal/usage"), { DB });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ totalUsers: await accountCount(DB) });
  expect(await accountCount(DB)).toBe(2);
});
