import { describe, expect, it } from "vitest";
import { flow, type Mode } from "./voterFlow";
import { results2026 } from "./guessAccuracyData";

/**
 * שמירה על "מה השתנה" (29.10.2026): עדכון קלפיות שמשבש את מטריצת המעבר נכשל כאן לפני פרסום.
 * רשימה שרצה בשתי הבחירות באותן אותיות מקבלת את רוב קולותיה מעצמה ב-2022; אף רשימה לא מגיעה ברובה מ"לא הצביעו";
 * וכל קול של 2026 נשאר בחשבון (סכום כל עמודה = הקולות שבקובץ התוצאות).
 */
const SAME_LIST: Record<string, string> = { likud: "מחל", utj: "ג", shas: "שס", raam: "עם", rzp: "ט", yb: "ל" };

describe("מעבר המצביעים — תוצאות סבירות", () => {
  for (const mode of ["ballots", "localities"] as Mode[]) {
    const F = flow.modes[mode].flows;
    const col = (id: string) => F.map((row) => row[flow.new.indexOf(id)]);
    const share = (id: string, letters: string) => { const c = col(id); return c[flow.old.indexOf(letters)] / c.reduce((a, b) => a + b, 0); };

    it(`${mode}: רשימה שרצה בשתי הבחירות — רוב קולותיה ממנה`, () => {
      for (const [id, letters] of Object.entries(SAME_LIST)) expect(share(id, letters), `${id} ⇐ ${letters}`).toBeGreaterThan(0.5);
    });

    it(`${mode}: אף רשימה לא מגיעה ברובה מ"לא הצביעו"`, () => {
      for (const id of flow.new.filter((x) => x !== "abstain" && x !== "other")) {
        const c = col(id);
        const total = c.reduce((a, b) => a + b, 0);
        if (total > 0) expect(c[flow.old.indexOf("abstain")] / total, id).toBeLessThan(0.5);
      }
    });

    it(`${mode}: הקולות של כל רשימה = קובץ התוצאות`, () => {
      for (const [id, votes] of Object.entries(results2026.votes ?? {})) expect(col(id).reduce((a, b) => a + b, 0), id).toBe(votes);
    });
  }
});
