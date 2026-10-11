import { expect, it } from "vitest";
import { blocsText, sortRows, toCsv, type GuessRow } from "./AdminGuesses";

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

it("שדות הפעילות מוצגים בעמודות ה-CSV: הצבעה שמורה, שמירות, הרשמה, כניסה אחרונה וכניסות", () => {
  const r = { ...row(), hasVote: true, saves: 7, registered: "2026-10-09T09:15:00Z", lastLogin: "2026-10-10T18:30:00Z", logins: 3 };
  const [head, line] = toCsv([r]).split("\n");
  expect(head).toContain('"הצבעה שמורה","סה״כ שמירות","נרשם","כניסה אחרונה","כניסות"');
  expect(line).toContain('"כן","7"');
  expect(line).toContain('"3"');
  const none = toCsv([row()]).split("\n")[1];
  expect(none).toContain('"לא","0","—","—","0"');
});

it("מיון לפי רישום, כניסה אחרונה ושמירת ההשערה: מהחדש לישן, בלי ערך בסוף; אקראי משאיר את הסדר", () => {
  const mk = (handle: string, registered: string | null, lastLogin: string | null, savedAt: string): GuessRow => ({ ...row(), handle, registered, lastLogin, savedAt });
  const rows = [mk("a", "2026-10-01T10:00:00Z", null, "2026-10-09T08:00:00Z"), mk("b", "2026-10-03T10:00:00Z", "2026-10-05T10:00:00Z", "2026-10-07T08:00:00Z"), mk("c", null, "2026-10-08T10:00:00Z", "2026-10-10T08:00:00Z")];
  const order = (s: Parameters<typeof sortRows>[1]) => sortRows(rows, s).map((r) => r.handle).join("");
  expect(order("registered")).toBe("bac");
  expect(order("lastLogin")).toBe("cba");
  expect(order("saved")).toBe("cab");
  expect(order("random")).toBe("abc");
});
