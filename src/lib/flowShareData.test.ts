import { describe, expect, it } from "vitest";
import { biggestChangeCities, buildScene, cityStats, HAREDI, type CityStat, type ShareSpec } from "./flowShareData";
import { results2026 } from "./guessAccuracyData";
import { results } from "./data";
import type { BallotUnits } from "./ballotLookup";

const k25seats = (letters: string) => results.find((e) => e.knesset === 25)!.lists.find((l) => l.letters === letters)!.seats;
const country: ShareSpec = { who: "party", party: "likud", where: "country", city: "", mode: "localities" };

// שתי ערים: בבית ב הליכוד מ-100 ל-110 מתוך 200 בעלי זכות בשתי הבחירות
const units: BallotUnits = {
  letters22: ["מחל", "ב", "other"], letters26: ["מחל", "ב", "other"],
  places: {
    a: { name: "בית א", y22: [["1", "3", 100, 80, 40, 30, 5]], y26: [["1", "7", 120, 100, 60, 30, 5]] },
    b: { name: "בית ב", y22: [["1", "3", 200, 150, 100, 40, 5]], y26: [["1", "9", 200, 160, 110, 40, 5]] },
  },
};

describe("תמונות שיתוף: מודל הנתונים", () => {
  it("מפלגה בכל הארץ: ארבעה פרמטרים בסדר מצביעים, מנדטים, מזכות בחירה, מהכשרים — והשינוי בחץ", () => {
    const scene = buildScene(country, null)!;
    expect(scene.title).toBe("הליכוד • כל הארץ");
    expect(scene.sub).toMatch(/^\d+% מספירת הקולות$/);
    const [votes, seats, ofEligible, ofValid] = scene.blocks[0].params;
    expect([votes.key, seats.key, ofEligible.key, ofValid.key]).toEqual(["votes", "seats", "ofEligible", "ofValid"]);
    expect(seats.value).toBe(String(results2026.seats.likud));
    const d = results2026.seats.likud - k25seats("מחל");
    expect(seats.change).toEqual(d ? { up: d > 0, text: String(Math.abs(d)) } : null);
    expect(votes.change).not.toBeNull();
    expect(ofValid.value).toMatch(/%$/);
  });
  it("חרדים: ש״ס ויהדות התורה בנפרד, ואין שינוי — אין סימון", () => {
    const scene = buildScene({ ...country, who: "haredi" }, null)!;
    expect(HAREDI).toEqual(["shas", "utj"]);
    expect(scene.blocks.map((b) => b.name)).toEqual(["ש\"ס", "יהדות התורה"]);
    const utj = scene.blocks[1].params.find((p) => p.key === "seats")!;
    expect(utj.value).toBe(String(results2026.seats.utj));
    expect(utj.change === null).toBe(results2026.seats.utj === k25seats("ג"));
  });
  it("כל המפלגות כוללת גם רשימות בלי מנדטים (המילואימניקים, עמך ישראל)", () => {
    const names = buildScene({ ...country, who: "all" }, null)!.table!.rows.map((r) => r.name);
    expect(names).toContain("המילואימניקים-הכלכלית");
    expect(names).toContain("עמך ישראל");
    expect(buildScene({ ...country, who: "all" }, null)!.table!.headers).toEqual(["מצביעים", "מנדטים", "מזכות בחירה", "מהכשרים"]);
  });
  it("מפלגה בעיר: שלושה פרמטרים בלי מנדטים, מחושבים מקלפיות העיר", () => {
    const scene = buildScene({ ...country, where: "city", city: "בית ב" }, units)!;
    expect(scene.title).toBe("הליכוד • בית ב");
    const params = scene.blocks[0].params;
    expect(params.map((p) => p.key)).toEqual(["votes", "ofEligible", "ofValid"]);
    expect(params[0].value).toBe("110");
    expect(params[0].change).toEqual({ up: true, text: "10" });
    expect(scene.withCities).toBe(false);
  });
  it("עיר שלא נבחרה מהרשימה — אין תמונה", () => {
    expect(buildScene({ ...country, where: "city", city: "בית" }, units)).toBeNull();
    expect(buildScene({ ...country, where: "city", city: "בית ב" }, null)).toBeNull();
  });
  it("השינוי הגדול ביותר: לפי הערך המוחלט של השינוי באחוז מבעלי זכות הבחירה, ובקטן האחוז ב-2026", () => {
    const stats: CityStat[] = [
      { code: "1", name: "א", votes26: 100, votes22: 100, el26: 1000, el22: 1000, valid26: 500, valid22: 500 },
      { code: "2", name: "ב", votes26: 100, votes22: 150, el26: 1000, el22: 1000, valid26: 500, valid22: 500 },
      { code: "3", name: "ג", votes26: 140, votes22: 100, el26: 1000, el22: 1000, valid26: 500, valid22: 500 },
    ];
    const lines = biggestChangeCities(stats, 3);
    expect(lines.map((l) => l.name)).toEqual(["ב", "ג"]);
    expect(lines[0].change).toEqual({ up: false, text: "5.0%" });
    expect(lines[1].small).toBe("14.0%");
  });
  it("cityStats: 2022 לפי הרשימות שקדמו לליכוד, ובעלי הזכות לפי הקלפיות של כל שנה", () => {
    const [b] = cityStats(units, ["likud"], "b");
    expect(b).toMatchObject({ votes26: 110, votes22: 100, el26: 200, el22: 200, valid26: 155, valid22: 145 });
  });
});
