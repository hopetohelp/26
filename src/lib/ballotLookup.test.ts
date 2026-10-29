import { describe, expect, it } from "vitest";
import { lookupScopes, sortLookupScopes, subBallotOptions, comparisonBallots, ballotComparisonStatus, ballotOptions, ballotPartyRows, ballotSummary, filterBallots, matchingPlaces, subOptions, type BallotUnits } from "./ballotLookup";

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

it("רמת ההשוואה לפי השדות: תת קלפי זהה וקלפי שלמה זהה הן מדויקות", () => {
  for (const sub of ["", "1"]) {
    const filter = { city: "בית א", ballot: "1", sub };
    const selected = comparisonBallots(units, filter);
    expect(selected.status.level).toBe("exact");
    expect(selected.status.label).toBe("מדויק");
    expect(selected.estimated).toBe(false);
    expect(selected.y22).toEqual(filterBallots(units, filter).y22);
  }
});

it("תת קלפי חדשה נאמדת מהקלפי השלמה לפי בעלי הזכות, עם עיגול קולות ששומר את הסכום", () => {
  const split = { ...units, places: { a: { ...units.places.a, y26: [...units.places.a.y26, ["1.3", "7", 50, 40, 20, 10, 5] as [string, string, number, number, ...number[]]] } } };
  const selected = comparisonBallots(split, { city: "בית א", ballot: "1", sub: "3" });
  expect(selected.status).toMatchObject({ level: "ballot", label: "לפי קלפי", reason: "תת קלפי חדשה" });
  expect(selected.estimated).toBe(true);
  expect(selected.y26).toEqual([["1.3", "7", 50, 40, 20, 10, 5]]);
  // 2022 בקלפי השלמה: 200 בעלי זכות, 140 מצביעים, 130 כשרים. התאמה ל־50 בעלי זכות: רבע.
  expect(selected.y22[0].slice(2)).toEqual([50, 35, 13, 18, 2]);
  expect(ballotSummary(selected.y22, units.letters22)).toMatchObject({ eligible: 50, voters: 35, valid: 33 });
  expect(ballotPartyRows(units, selected.y22, selected.y26).find((r) => r.id === "likud")).toMatchObject({ votes22: 13, votes26: 20 });
});

it("קלפי חדשה נאמדת מהעיר, ובתת קלפי חדשה בלי קלפי שלמה מקבילה מציינים את הסיבה", () => {
  const selected = comparisonBallots(units, { city: "בית א", ballot: "15", sub: "" });
  expect(selected.status).toMatchObject({ level: "city", label: "לפי עיר" });
  // העיר ב־2022: 300 זכאים, 190 מצביעים, 170 כשרים. הקלפי החדשה: 100 זכאים — שליש.
  expect(selected.y22[0].slice(2)).toEqual([100, 63, 20, 30, 7]);
  expect(selected.y26).toEqual([["15", "8", 100, 50, 20, 10, 10]]);
  const split = { ...units, places: { a: { ...units.places.a, y26: [["15.1", "8", 50, 35, 20, 5, 5] as [string, string, number, number, ...number[]]] } } };
  const sub = comparisonBallots(split, { city: "בית א", ballot: "15", sub: "1" });
  expect(sub.status).toMatchObject({ level: "city", reason: "תת קלפי וקלפי שלמה חדשות" });
  expect(sub.y22[0].slice(2)).toEqual([50, 32, 10, 15, 3]);
});

it("בסינון עיר סופרים קלפיות שלמות בלי לספור תתי קלפי פעמיים ובלי לערבב מספרים בין ערים", () => {
  const city = comparisonBallots(units, { city: "בית א", ballot: "", sub: "" });
  expect(city.status).toMatchObject({ label: "(50% לפי הקלפי, 50% לפי היישוב)", exactBallots: 1, totalBallots: 2 });
  expect(city.y22).toEqual(units.places.a.y22);
  expect(city.estimated).toBe(false);
  expect(ballotComparisonStatus(units, { city: "", ballot: "", sub: "" })).toMatchObject({ exactBallots: 2, totalBallots: 3 });
});

it("אין אומדן בלי מקור 2022 או בלי בעלי זכות; אין השלמה של קלפי שעדיין לא נספרה ב־2026", () => {
  const missing = { ...units, places: { a: { ...units.places.a, y22: [] } } };
  const selected = comparisonBallots(missing, { city: "בית א", ballot: "15", sub: "" });
  expect(selected.status.level).toBe("unavailable");
  expect(selected.y22).toEqual([]);
  expect(selected.y26).toEqual([["15", "8", 100, 50, 20, 10, 10]]);
  expect(comparisonBallots(units, { city: "בית א", ballot: "12", sub: "" })).toMatchObject({ estimated: false, status: { level: "unavailable" }, y26: [] });
});

it("הכל בעיר מחזיר ערים נפרדות; מיון מצביעים ומיון אחוז הצבעה נותנים סדר שונה", () => {
  const scopes = lookupScopes(units, { city: "", ballot: "", sub: "" }, "city");
  expect(scopes.map((s) => s.label)).toEqual(["בית א", "בית ב"]);
  expect(sortLookupScopes(scopes, "voters").map((s) => s.city)).toEqual(["בית א", "בית ב"]);
  expect(sortLookupScopes(scopes, "turnout").map((s) => s.city)).toEqual(["בית ב", "בית א"]);
  expect(scopes.find((s) => s.code === "a")).toMatchObject({ voters: 190, turnout: 190 / 300 * 100 });
});

it("הכל בקלפי מפריד מספרים שחוזרים בערים שונות, ומוגבל לעיר שנכתבה", () => {
  const all = lookupScopes(units, { city: "", ballot: "", sub: "" }, "ballot");
  expect(all).toHaveLength(4);
  expect(all.filter((s) => s.ballot === "1").map((s) => s.code)).toEqual(["a", "b"]);
  const city = lookupScopes(units, { city: "בית א", ballot: "", sub: "" }, "ballot");
  expect(city.map((s) => s.ballot)).toEqual(["1", "12", "15"]);
  expect(sortLookupScopes(city, "voters").map((s) => s.ballot)).toEqual(["1", "15", "12"]);
  expect(city.find((s) => s.ballot === "12")).toMatchObject({ voters: null, turnout: null });
});

it("הכל בתת קלפי מחזיר כל תת קלפי לחוד, עם הגבלת עיר וקלפי ותוצאות מסוננות בהקלדה", () => {
  const scopes = lookupScopes(units, { city: "בית א", ballot: "1", sub: "" }, "sub");
  expect(scopes.map((s) => s.id)).toEqual(["sub:a:1.1", "sub:a:1.2"]);
  expect(scopes.map((s) => s.voters)).toEqual([100, 40]);
  expect(subBallotOptions(matchingPlaces(units, "בית א"), "1", "2").map((s) => s.fullNumber)).toEqual(["1.2"]);
  expect(lookupScopes(units, { city: "בית ב", ballot: "1", sub: "" }, "sub")).toEqual([]);
});
