import { describe, expect, it } from "vitest";
import { ELECTIONS, previousElection, previousSummary } from "./election";

describe("בורר המערכות והמערכת הקודמת", () => {
  it("2013 בבורר, הוותיקה ביותר; 2015 מושווית ל־2013", () => {
    expect(ELECTIONS.at(-1)?.id).toBe("k19");
    expect(previousElection("k20")?.id).toBe("k19");
  });

  it("2013 מושווית ל־2009 (לא בבורר), מהסיכום הרשמי של קובץ הקלפיות", () => {
    expect(previousElection("k19")?.label).toBe("2009");
    expect(ELECTIONS.some((o) => o.id === "k18")).toBe(false);
    expect(previousSummary("k19")).toMatchObject({ eligible: 5278985, voted: 3416587, valid: 3373490, invalid: 43097 });
  });
});
