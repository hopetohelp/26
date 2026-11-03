import { describe, it, expect } from "vitest";
import { groupSmallRows } from "./votingRows";
const row = (key: string, previousN: number | null, nextN: number | null) => ({ key, name: key, actual: 1, official: 1, previous: 1, next: 1, previousN, nextN });
describe("רשימות אחרות", () => {
  it("רשימות עם עד 5 קולות מתאחדות לשורה אחת לפני שורות הלא־מצביעים", () => {
    const out = groupSmallRows([row("a", 10, 20), row("b", 2, 3), row("c", null, 5), row("answer:none", 1, 1)]);
    expect(out.map(r => r.key)).toEqual(["a", "small", "answer:none"]);
    expect(out[1]).toMatchObject({ name: "רשימות אחרות", previousN: 2, nextN: 8, actual: 2 });
  });
  it("רשימה קטנה אחת נשארת בשמה", () => {
    expect(groupSmallRows([row("a", 10, 20), row("b", 2, 3)]).map(r => r.key)).toEqual(["a", "b"]);
  });
});
