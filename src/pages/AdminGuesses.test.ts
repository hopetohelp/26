import { expect, it } from "vitest";
import { blocsText, toCsv, type GuessRow } from "./AdminGuesses";

const row = (blocs?: GuessRow["blocs"]): GuessRow => ({ handle: "h", day: "2026-10-09", mode: "seats", seats: { likud: 60, yashar: 60 }, status: "ok", reasons: [], blocs });

it("הגושים של השערה בשורה אחת, עם סכום, יעד והרשימות", () => {
  const r = row({ saved: true, items: [{ name: "הגוש שלי", lists: ["likud", "yashar"], seats: 120, target: 100 }, { name: "", lists: [], seats: 0, target: null }] });
  expect(blocsText(r)).toBe("הגוש שלי: 120 (יעד 100) [הליכוד, ישר!] | גוש ללא שם: 0 []");
  expect(blocsText(row())).toBe("");
});

it("הורדת CSV כוללת עמודת גושים בסוף", () => {
  const csv = toCsv([row({ saved: false, items: [{ name: "ערבים", lists: ["joint", "raam"], seats: 8, target: null }] })]);
  const [head, line] = csv.split("\n");
  expect(head.endsWith('"גושים"')).toBe(true);
  expect(line).toContain("ערבים: 8");
});
