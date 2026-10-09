import { describe, expect, it } from "vitest";
import { blocRangeSegs, rangeRow } from "./homeCharts";
import { HOME } from "../lib/homeData";
import { valueSegs } from "../lib/chartLanguage";

/**
 * כלל הטווחים לפי מקור הנתון (הכרעת בעלים 9.10.2026):
 * - כל טווח שמבוסס על תרחישים ⇐ 80% (מ-10% עד 90%): הדירוג, מגמת הממשלה, "מה השתנה".
 * - כל טווח שמבוסס על סקרים, השערות, נתונים או חוק הבחירות ⇐ מלא (הנמוך והגבוה): סיכום המכונים, הסקרים מול התוצאות, מגמות, סקר האתר.
 */
describe("הדירוג: מבוסס על תרחישים ⇐ טווח 80%", () => {
  const rows = [...HOME.safe, ...HOME.edge];
  it("קצוות הנר הם טווח 80% של התרחישים (lo ו-hi), לא הנמוך והגבוה", () => {
    for (const r of rows) {
      const d = rangeRow(r);
      expect([d.lo, d.hi]).toEqual([r.lo, r.hi]);
      expect(d.segs[0].from).toBeGreaterThanOrEqual(r.lo - 1e-9);
      expect(d.segs[d.segs.length - 1].to).toBeLessThanOrEqual(r.hi + 1e-9);
    }
  });
  it("ההתפלגות המלאה רחבה מהטווח, ולכן הנר באמת נחתך (לפחות ברשימה אחת)", () => {
    const cut = rows.filter((r) => {
      const first = r.hist.findIndex((c) => c > 0);
      return first < r.lo - 0.5 || r.hist.length - 1 > r.hi + 0.5;
    });
    expect(cut.length).toBeGreaterThan(0);
  });
  it("הממוצע של כל רשימה בתוך הנר שלה", () => {
    for (const r of rows) {
      const d = rangeRow(r);
      expect(r.central).toBeGreaterThanOrEqual(d.lo);
      expect(r.central).toBeLessThanOrEqual(d.hi);
    }
  });
});

describe("מגמת הממשלה: מבוסס על תרחישים ⇐ טווח 80%", () => {
  it("הנר חתוך בדיוק ל-blocLo עד blocHi", () => {
    const segs = blocRangeSegs(HOME);
    expect(segs[0].from).toBeGreaterThanOrEqual(HOME.blocLo - 1e-9);
    expect(segs[segs.length - 1].to).toBeLessThanOrEqual(HOME.blocHi + 1e-9);
    expect(segs[0].from).toBeLessThan(HOME.blocLo + 1);
    expect(segs[segs.length - 1].to).toBeGreaterThan(HOME.blocHi - 1);
  });
  it("בלי התפלגות: נר אחד בטווח עצמו", () => {
    expect(blocRangeSegs({ blocLo: 50, blocHi: 60, blocHist: [] })).toEqual([{ from: 50, to: 60, count: 1 }]);
  });
});

describe("מבוסס על סקרים או השערות ⇐ טווח מלא", () => {
  it("סיכום המכונים: הנר מהנמוך עד הגבוה בין המכונים, בלי חיתוך", () => {
    const values = [8, 9, 9, 10, 14];
    const segs = valueSegs(values);
    expect(segs[0].from).toBe(8);
    expect(segs[segs.length - 1].to).toBe(14);
  });
});
