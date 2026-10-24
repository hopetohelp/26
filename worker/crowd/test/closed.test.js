import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { closedLists } from "../../../scripts/poll-ranges.mjs";
import { CLOSED_LISTS as SITE } from "../../../src/lib/data.ts";
import { GUESS_IDS } from "../../../src/pages/guess/model.ts";

// מקור אמת אחד: אותה הגדרה באתר ובשרת (הכרעת בעלים 24.10.2026) — רשימה שלא עברה 4 מנדטים באף סקר
describe("רשימות שאי אפשר לנחש עליהן", () => {
  // השרת מקבל את הרשימה מ-poll-ranges.json שנבנה עם האתר (closedLists) — אותה הגדרה כמו באתר
  const polls = JSON.parse(readFileSync(new URL("../../../src/data/polls.json", import.meta.url), "utf8")).polls;
  const meta = JSON.parse(readFileSync(new URL("../../../src/data/meta.json", import.meta.url), "utf8"));
  const CLOSED_LISTS = closedLists(polls, meta.lists2026.filter((l) => !l.withdrawn).map((l) => l.id));
  it("זהות באתר ובשרת", () => expect([...CLOSED_LISTS].sort()).toEqual([...SITE].sort()));
  it("אינן בעורך ההשערה", () => { for (const id of CLOSED_LISTS) expect(GUESS_IDS).not.toContain(id); });
});
