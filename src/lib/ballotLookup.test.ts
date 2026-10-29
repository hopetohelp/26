import { describe, expect, it } from "vitest";
import { ballotOptions, ballotPartyRows, ballotSummary, filterBallots, matchingPlaces, subOptions, type BallotUnits } from "./ballotLookup";

// שתי ערים עם אותו מספר קלפי, קלפי שפוצלה, קלפי שנוספה וקלפי שטרם נספרה.
const units: BallotUnits = {
  letters22: ["מחל", "ב", "other"], letters26: ["מחל", "ב", "other"],
  places: {
    a: { name: "בית א", y22: [["1.1", "3", 100, 80, 40, 30, 5], ["1.2", "3", 100, 60, 10, 40, 5], ["12", "4", 100, 50, 10, 20, 10]],
      y26: [["1.1", "7", 120, 100, 60, 30, 5], ["1.2", "7", 80, 40, 10, 20, 5], ["15", "8", 100, 50, 20, 10, 10]] },
    b: { name: "בית ב", y22: [["1", "3", 200, 150, 100, 40, 5]], y26: [["1", "9", 200, 160, 110, 40, 5]] },
  },
};

describe("בדיקה לפי קלפי", () => {
  it("מסנן מיד לפי טקסט העיר, ולא מערבב קלפי בעלת אותו מספר בעיר אחרת", () => {
    expect(filterBallots(units, { city: "בית", ballot: "", sub: "" }).y26).toHaveLength(4);
    const selected = filterBallots(units, { city: "בית א", ballot: "1", sub: "" });
    expect(ballotSummary(selected.y26, units.letters26)).toEqual({ eligible: 200, voters: 140, valid: 130, turnout: 70, validShare: 130 / 140 * 100, present: true });
    expect(ballotOptions(matchingPlaces(units, "בית א"), "1").map((b) => b.number)).toEqual(["1", "12", "15"]);
  });
  it("תת קלפי נפרדת; ניקוי השדה מחזיר את כל תתי הקלפי", () => {
    expect(subOptions(matchingPlaces(units, "בית א"), "1")).toEqual(["1", "2"]);
    expect(filterBallots(units, { city: "בית א", ballot: "1", sub: "2" }).y26).toEqual([["1.2", "7", 80, 40, 10, 20, 5]]);
    expect(filterBallots(units, { city: "בית א", ballot: "1", sub: "" }).y26).toHaveLength(2);
    expect(filterBallots(units, { city: "בית א", ballot: "", sub: "" }).y26).toHaveLength(3);
    expect(filterBallots(units, { city: "לא קיימת", ballot: "", sub: "" }).y26).toEqual([]);
  });
  it("מציג את כל ההצעות גם כשיש יותר מ-20, ומבדיל בין ערים", () => {
    const p = { name: "בדיקה", y22: [], y26: Array.from({ length: 50 }, (_, k) => [String(k + 1), "3", 1, 1, 1] as [string, string, number, number, number]) };
    expect(ballotOptions([["c", p]], "")).toHaveLength(50);
    expect(ballotOptions(matchingPlaces(units, ""), "1").filter((o) => o.number === "1").map((o) => o.id)).toEqual(["a:1", "b:1"]);
  });
  it("מחשב אחוזי מפלגות מכל הכשרים, ולא מכלל המצביעים, ושומר רשימות שונות באות ב בנפרד", () => {
    const s = filterBallots(units, { city: "בית א", ballot: "1", sub: "" });
    const rows = ballotPartyRows(units, s.y22, s.y26);
    expect(rows.find((r) => r.id === "likud")).toMatchObject({ votes22: 50, votes26: 70 });
    expect(rows.find((r) => r.id === "otzma")).toMatchObject({ votes22: null, votes26: 50 });
    expect(rows.find((r) => r.id === "2022:ב")).toMatchObject({ votes22: 70, votes26: null });
    expect(rows.reduce((s, r) => s + (r.votes22 ?? 0), 0)).toBe(130);
    expect(rows.reduce((s, r) => s + (r.votes26 ?? 0), 0)).toBe(130);
  });
  it("קלפי בלי נתונים בשנה אחת אינה מוצגת כאפס מצביעים, ובלי חלוקה באפס", () => {
    const s = filterBallots(units, { city: "בית א", ballot: "12", sub: "" });
    expect(ballotSummary(s.y26, units.letters26)).toMatchObject({ present: false, turnout: null, validShare: null });
    expect(ballotPartyRows(units, s.y22, s.y26).every((r) => r.votes26 === null)).toBe(true);
    expect(ballotSummary([["1", "1", 0, 0, 0, 0, 0]], units.letters26)).toMatchObject({ present: true, turnout: null, validShare: null });
  });
});

it("מיקום מלא של קלפי 2026: מבנה וכתובת לפי יישוב ומספר, בלי להפוך מספר מרכז לכתובת", () => {
  const locations = { about: { year: 2026, source: "ועדת הבחירות", snapshot: "מקור" }, locations: { "a:1.1": { venue: 'בית ספר', address: 'הרחוב 6', center: "7", eligible: 120 }, "a:1.2": { venue: 'בית ספר', address: 'הרחוב 6', center: "7", eligible: 80 } } };
  expect(ballotOptions(matchingPlaces(units, "בית א"), "1", locations).find((b) => b.number === "1")?.location).toBe("בית ספר · הרחוב 6");
  expect(ballotOptions(matchingPlaces(units, "בית א"), "12", locations)[0].location).toBe("מרכז קלפיות 4 (2022)");
});

it("מעדיף את מיקום הקלפי השלמה ב-2026 גם כשהחלוקה לתת קלפי השתנתה, ומיקום תת קלפי נשאר מדויק", () => {
  const locations = { about: { year: 2026, source: "ועדת הבחירות", snapshot: "מקור" }, locations: {
    "a:1.1": { venue: "מבנה א", address: "רחוב א 1", center: "7", eligible: 120 },
    "a:1.2": { venue: "מבנה ב", address: "רחוב ב 2", center: "8", eligible: 80 },
  }, locations22: { "a:12": "רחוב ישן 4" } };
  const p = matchingPlaces(units, "בית א");
  expect(ballotOptions(p, "1", locations).find((b) => b.number === "1")?.location).toBe("מבנה א · רחוב א 1 / מבנה ב · רחוב ב 2");
  expect(ballotOptions(p, "1", locations, "2")[0].location).toBe("מבנה ב · רחוב ב 2");
  expect(ballotOptions(p, "12", locations)[0].location).toBe("רחוב ישן 4 (2022)");
});
