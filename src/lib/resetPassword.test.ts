import { describe, expect, it } from "vitest";
import { clearResetSecret, getResetSecret, setResetSecret } from "./resetPassword";

describe("סוד איפוס הסיסמה בזיכרון", () => {
  it("נשמר רק סוד בפורמט תקין, ונמחק אחרי שימוש", () => {
    setResetSecret("short");
    expect(getResetSecret()).toBeNull();
    setResetSecret("A".repeat(32));
    expect(getResetSecret()).toBe("A".repeat(32));
    clearResetSecret();
    expect(getResetSecret()).toBeNull();
    setResetSecret("bad secret with spaces and more than twenty chars");
    expect(getResetSecret()).toBeNull();
  });
});
