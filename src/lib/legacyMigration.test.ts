import { describe, expect, it } from "vitest";
import { importLegacyEntries } from "./legacyMigration";

function memory(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  } as Storage;
  return { data, storage };
}

describe("העברת מידע מקומי מהאתר הישן", () => {
  it("מעבירה סשן וטיוטה לכתובת החדשה בלי קישור או פרמטר URL", () => {
    const { data, storage } = memory();
    const entries = [["elections26.crowd.token", "private-token"], ["elections26.crowd.draft.seats", "{\"seats\":{}}"]];
    expect(importLegacyEntries(entries, storage)).toBe("done");
    expect(data.get("elections26.crowd.token")).toBe("private-token");
    expect(data.get("elections26.crowd.draft.seats")).toBe("{\"seats\":{}}");
  });
  it("אינה דורסת מידע אחר שכבר נשמר באתר החדש", () => {
    const { data, storage } = memory({ "elections26.crowd.token": "new-account" });
    expect(importLegacyEntries([["elections26.crowd.token", "old-account"], ["elections26.camps", "[]"]], storage)).toBe("conflict");
    expect([...data]).toEqual([["elections26.crowd.token", "new-account"]]);
  });
  it("מעבירה מזהה ביקור ישן ושומרת העדפה ומזהה קיימים באתר החדש", () => {
    const { data, storage } = memory({ "elections26.mode": "dark", "elections26.vid": "new-visitor" });
    expect(importLegacyEntries([
      ["elections26.mode", "light"],
      ["elections26.vid", "old-visitor"],
      ["elections26.crowd.draft.vote", "{}"],
    ], storage)).toBe("done");
    expect(data.get("elections26.mode")).toBe("dark");
    expect(data.get("elections26.vid")).toBe("new-visitor");
    expect(data.get("elections26.crowd.draft.vote")).toBe("{}");
    const empty = memory();
    expect(importLegacyEntries([["elections26.vid", "old-visitor"]], empty.storage)).toBe("done");
    expect(empty.data.get("elections26.vid")).toBe("old-visitor");
  });
  it("דוחה מפתחות שאינם ברשימה, כולל מפתח מנהל", () => {
    const { data, storage } = memory();
    expect(importLegacyEntries([["elections26.admin", "secret"]], storage)).toBe("error");
    expect(data.size).toBe(0);
  });
});
