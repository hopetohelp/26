import { describe, it, expect } from "vitest";
import { credentialFrom, CREDENTIAL } from "./embedLogin";

describe("כניסה אחת בעמוד המוטמע", () => {
  const jwt = "a.b.c";
  it("מקבל אסימון רק מכתובת מורשית ובסוג הנכון", () => {
    expect(credentialFrom("https://hagzara.example", { type: CREDENTIAL, credential: jwt }, ["https://hagzara.example"])).toBe(jwt);
    expect(credentialFrom("https://evil.example", { type: CREDENTIAL, credential: jwt }, ["https://hagzara.example"])).toBeNull();
    expect(credentialFrom("https://hagzara.example", { type: "other", credential: jwt }, ["https://hagzara.example"])).toBeNull();
    expect(credentialFrom("https://hagzara.example", { type: CREDENTIAL, credential: "not-a-jwt" }, ["https://hagzara.example"])).toBeNull();
    expect(credentialFrom("https://hagzara.example", { type: CREDENTIAL, credential: jwt }, [])).toBeNull();
  });
});
