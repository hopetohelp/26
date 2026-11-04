import { describe, expect, it } from "vitest";
import { electionMarkersOf } from "./electionMarkers";
import { firstExitPolls, type ExitPoll } from "./data";

const ep = (publisher: string, publishedAt: string, s: number): ExitPoll => ({
  id: `${publisher}-${publishedAt}`, firm: "f", firmHe: "f", publisher, publisherHe: publisher, publishedAt,
  values: { a: { s } }, urls: ["https://example.org"], verified: true,
});

describe("מדגמי 22:00 מול עדכוני הלילה", () => {
  const polls = [ep("Kan", "2022-11-01T22:00:00+02:00", 30), ep("Kan", "2022-11-02T00:30:00+02:00", 40), ep("C12", "2022-11-01T22:00:00+02:00", 32)];
  it("firstExitPolls לוקח את הפרסום הראשון של כל ערוץ", () => {
    expect(firstExitPolls(polls).map((p) => p.id).sort()).toEqual(["C12-2022-11-01T22:00:00+02:00", "Kan-2022-11-01T22:00:00+02:00"]);
  });
  it("נקודת ממוצע המדגמים במגמות אינה כוללת עדכונים", () => {
    const m = electionMarkersOf({ day: "2022-11-01", exitPolls: polls, result: null }, ["a"]);
    expect(m[0].v).toBe(31);
  });
});
