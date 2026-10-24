import { describe, it, expect } from "vitest";
import { emailsFromText, sendWithSplit, stagedChunks, uploadChunks, uploadStaged } from "./groupUpload";
import { CrowdError, GROUP_CHUNK } from "./crowdApi";

describe("group list upload", () => {
  it("reads one email per line and other separators, dropping blanks and repeats", () => {
    expect(emailsFromText("a@x.co\r\n\r\nb@x.co, \"c@x.co\";a@x.co\nשם בלי מייל\n")).toEqual(["a@x.co", "b@x.co", "c@x.co"]);
  });
  it("splits into chunks; only the first one replaces", () => {
    const emails = Array.from({ length: GROUP_CHUNK * 2 + 1 }, (_, i) => `u${i}@x.co`);
    const c = uploadChunks(emails, "replace");
    expect(c.map((x) => [x.emails.length, x.mode])).toEqual([[GROUP_CHUNK, "replace"], [GROUP_CHUNK, "add"], [1, "add"]]);
    expect(uploadChunks([], "add")).toEqual([]);
    expect(uploadChunks([], "replace")).toEqual([{ emails: [], mode: "replace" }]);
  });
});

describe("sendWithSplit", () => {
  const ok = (emails: string[]) => ({ group: "g", added: emails.length, duplicates: 0, invalid: 0, members: emails.length });
  it("מנה שנכשלת מתחלקת עד שכל מייל תקין נשמר, והמייל הבעייתי נספר", async () => {
    const seen: string[][] = [];
    const send = async (c: { emails: string[]; mode: "add" | "replace" }) => {
      seen.push(c.emails);
      if (c.emails.length > 2 || c.emails.includes("bad@x.co")) throw new Error("network");
      return ok(c.emails);
    };
    const r = await sendWithSplit(send, { emails: ["a@x.co", "b@x.co", "bad@x.co", "c@x.co", "d@x.co"], mode: "replace" }, async () => {});
    expect(r.added).toBe(4);
    expect(r.failed).toBe(1);
  });
  it("רק החלק הראשון שומר את מצב ההחלפה", async () => {
    const modes: string[] = [];
    const send = async (c: { emails: string[]; mode: "add" | "replace" }) => { modes.push(c.mode); if (c.emails.length > 1) throw new Error("x"); return ok(c.emails); };
    await sendWithSplit(send, { emails: ["a@x.co", "b@x.co"], mode: "replace" }, async () => {});
    expect(modes).toEqual(["replace", "replace", "add"]);
  });
  it("שגיאת הרשאה עוצרת בלי חלוקה", async () => {
    let calls = 0;
    const send = async () => { calls++; throw new CrowdError(403, "not_manager"); };
    await expect(sendWithSplit(send, { emails: ["a@x.co", "b@x.co"], mode: "add" }, async () => {})).rejects.toBeInstanceOf(CrowdError);
    expect(calls).toBe(1);
  });
});

describe("uploadStaged", () => {
  it("מחלק לבקשות שמירה, ממשיך עד הסוף ומדווח התקדמות", async () => {
    const parts: number[] = [];
    const progress: Record<number, number> = {};
    let members = 0;
    const api = {
      start: async (c: { emails: string[]; mode: "add" | "replace" }) => { parts.push(c.emails.length); members += Math.min(200, c.emails.length); return { upload: parts.length, total: c.emails.length, done: Math.min(200, c.emails.length), invalid: 0, added: Math.min(200, c.emails.length), members, finished: c.emails.length <= 200 }; },
      next: async (u: number) => { const total = parts[u - 1]; progress[u] = Math.min(total, (progress[u] ?? 200) + 200); members += 200; const done = progress[u]; return { upload: u, total, done, invalid: 0, added: done, members, finished: done >= total }; },
    };
    const seen: number[] = [];
    const r = await uploadStaged(api, Array.from({ length: 2300 }, (_, i) => `u${i}@x.co`), "add", (d) => seen.push(d), async () => {});
    expect(parts).toEqual([2000, 300]);
    expect(seen[seen.length - 1]).toBe(2300);
    expect(r.members).toBe(members);
  });
  it("תקלה רגעית בהמשך ⇐ ניסיון חוזר", async () => {
    let fails = 1;
    const api = {
      start: async () => ({ upload: 1, total: 400, done: 200, invalid: 0, added: 200, members: 200, finished: false }),
      next: async () => { if (fails-- > 0) throw new Error("network"); return { upload: 1, total: 400, done: 400, invalid: 0, added: 400, members: 400, finished: true }; },
    };
    const r = await uploadStaged(api, Array.from({ length: 400 }, (_, i) => `u${i}@x.co`), "add", () => {}, async () => {});
    expect(r.added).toBe(400);
  });
  it("החלפה רק בבקשה הראשונה", () => {
    expect(stagedChunks(Array.from({ length: 4001 }, (_, i) => `u${i}@x.co`), "replace").map((c) => [c.emails.length, c.mode])).toEqual([[2000, "replace"], [2000, "add"], [1, "add"]]);
  });
});
