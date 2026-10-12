import { describe, expect, it } from "vitest";
import { groupInviteMessage } from "./groupMessage";

describe("הודעה למנהלי קבוצות", () => {
  it("בפנייה ברבים, בלי פנייה ביחיד", () => {
    const m = groupInviteMessage();
    expect(m).toContain("הקבוצה שלכם");
    expect(m).toContain("מה צריך מכם");
    expect(m).not.toMatch(/הקבוצה שלך|מה צריך ממך|הכתובת שלך/);
  });
  it("מציינת שהכול כבר פעיל ושההשתתפות נשמרת כבר עכשיו", () => {
    const m = groupInviteMessage();
    expect(m).toContain("הכול כבר חי ועובד");
    expect(m).toContain("הנתונים שלו נשמרים כבר עכשיו");
    expect(m).toContain("גם אם תעלו את הרשימה רק אחרי הבחירות");
  });
  it("עם קישור הקבוצה — הוא מחליף את כתובת האתר ואינו חוזר בסוף; בלי — ההודעה הכללית", () => {
    const link = "https://hopetohelp.github.io/26/#/g/hagzara";
    const m = groupInviteMessage({ groupLink: link });
    expect(m).toContain(`הבחירות לכנסת ה-26 (${link})`);
    expect(m.split(link).length - 1).toBe(1);
    expect(m).not.toContain("(https://hopetohelp.github.io/26/)");
    const general = groupInviteMessage();
    expect(general).toContain("(https://hopetohelp.github.io/26/)");
    expect(general).not.toContain("#/g/");
  });
  it("מיילים של המנהלים שכבר הוגדרו מופיעים במשפט ההגדרה", () => {
    const m = groupInviteMessage({ groupLink: "https://x.example/g", managers: ["a@x.co", "b@y.co"] });
    expect(m).toContain("כבר מוגדרות אצלי כמנהלי הקבוצה (a@x.co, b@y.co). הקישור והמסך פעילים");
    expect(groupInviteMessage()).toContain("כבר מוגדרות אצלי כמנהלי הקבוצה. הקישור");
    expect(groupInviteMessage({ managers: [] })).not.toContain("()");
  });
  it("מה צריך מכם: לא צריך לדאוג גם לניסוח פוסטים והודעות", () => {
    const m = groupInviteMessage();
    expect(m).toContain("אפילו על ניסוח פוסטים והודעות על הסקר אין צורך לדאוג");
    expect(m).toContain("כפתור שיתוף עם נוסח ייעודי למנהלי קבוצה");
  });
  it("מבהירה שזה לא בא במקום סקרים מקיפים אלא ממוקד בהשערת הכנסת הבאה", () => {
    const m = groupInviteMessage();
    expect(m).toContain("לא בא במקום סקרים מקיפים");
    expect(m).toContain("איך תיראה הכנסת הבאה");
  });
  it("אין תאריך מלא בנקודות", () => expect(groupInviteMessage()).not.toMatch(/\d{1,2}\.\d{1,2}\.20\d{2}/));
});
