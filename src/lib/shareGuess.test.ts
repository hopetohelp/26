import { describe, expect, it } from "vitest";
import { decodeGuess, encodeGuess, shareUrl } from "./shareGuess";

const IDS = ["likud", "yashar", "shas", "haredi_public"];
const seats = { likud: 60, yashar: 40, shas: 20, haredi_public: 0 };

describe("shareGuess", () => {
  it("round-trips seats, pct and username", () => {
    const g = { seats, pct: { likud: 45.5, yashar: 30, shas: 20.1, haredi_public: 0 }, username: "דני_7" };
    const back = decodeGuess(encodeGuess(g), IDS);
    expect(back).toEqual(g);
    expect(shareUrl({ seats })).toMatch(/^https:\/\/hopetohelp\.github\.io\/26\/#\/guess\?g=[\w-]+$/);
  });
  it("omits username unless given", () => {
    expect(decodeGuess(encodeGuess({ seats }), IDS)).toEqual({ seats });
  });
  it("rejects bad input defensively", () => {
    const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeGuess(null, IDS)).toBeNull();
    expect(decodeGuess("!!!", IDS)).toBeNull();
    expect(decodeGuess("abc", IDS)).toBeNull();
    expect(decodeGuess(enc({ s: { likud: 119 } }), IDS)).toBeNull(); // סכום
    expect(decodeGuess(enc({ s: { nope: 120 } }), IDS)).toBeNull(); // מזהה
    expect(decodeGuess(enc({ s: { likud: 119.5, shas: 0.5 } }), IDS)).toBeNull(); // לא שלם
    expect(decodeGuess(enc({ s: { likud: 120 }, p: { likud: 1001 } }), IDS)).toBeNull();
    expect(decodeGuess(enc({ s: { likud: 120 }, p: { likud: 600, shas: 401 } }), IDS)).toBeNull();
    expect(decodeGuess(enc({ s: { likud: 120 }, u: "<script>" }), IDS)).toBeNull();
    expect(decodeGuess("a".repeat(2000), IDS)).toBeNull();
    expect(decodeGuess(enc({ s: { likud: 120 } }), IDS)).toEqual({ seats: { likud: 120, yashar: 0, shas: 0, haredi_public: 0 } });
  });
});
