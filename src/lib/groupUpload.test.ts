import { describe, it, expect } from "vitest";
import { emailsFromText, uploadChunks } from "./groupUpload";
import { GROUP_CHUNK } from "./crowdApi";

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
