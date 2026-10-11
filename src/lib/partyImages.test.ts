import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARTY_IMAGES } from "./partyImages";

describe("תמונות הרשימות", () => {
  it("לכל תמונה קובץ קיים, וחובה יוצר, רישיון ומקור (קרדיט)", () => {
    for (const [id, img] of Object.entries(PARTY_IMAGES)) {
      expect(existsSync(`public/${img.file}`), id).toBe(true);
      expect(img.subject && img.author && img.license, id).toBeTruthy();
      expect(img.source, id).toMatch(/^https:\/\//);
    }
  });
});
