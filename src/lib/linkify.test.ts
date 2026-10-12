import { describe, expect, it } from "vitest";
import { splitLinks } from "./linkify";

describe("קישורים בהודעות", () => {
  it("כתובת באמצע משפט עברי הופכת לקישור, והטקסט סביבה נשמר", () => {
    expect(splitLinks("הנה הקישור https://hopetohelp.github.io/26/#/g/hagzara ותודה")).toEqual([
      { text: "הנה הקישור " },
      { text: "https://hopetohelp.github.io/26/#/g/hagzara", href: "https://hopetohelp.github.io/26/#/g/hagzara" },
      { text: " ותודה" },
    ]);
  });
  it("פיסוק בסוף המשפט אינו חלק מהכתובת", () => {
    for (const end of [".", ",", "!", "?", ")", "."]) {
      const p = splitLinks(`ראו https://example.com/a${end}`);
      expect(p[1]).toEqual({ text: "https://example.com/a", href: "https://example.com/a" });
      expect(p[2]).toEqual({ text: end });
    }
  });
  it("כמה קישורים בהודעה אחת, ושורות חדשות נשמרות", () => {
    const p = splitLinks("https://a.co/x\nhttp://b.co/y");
    expect(p.filter((x) => x.href).map((x) => x.href)).toEqual(["https://a.co/x", "http://b.co/y"]);
    expect(p[1].text).toBe("\n");
  });
  it("רק http ו-https; כל השאר נשאר טקסט", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://a.co/x", "https://localhost", "www.example.com", "https://"])
      expect(splitLinks(`ראו ${bad}`).some((x) => x.href), bad).toBe(false);
  });
  it("טקסט בלי קישור חוזר כמות שהוא, וריק נשאר ריק", () => {
    expect(splitLinks("שלום")).toEqual([{ text: "שלום" }]);
    expect(splitLinks("")).toEqual([]);
  });
});
