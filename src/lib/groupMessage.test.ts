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
  it("עם קישור הקבוצה — הקישור בהודעה; בלי — ההודעה הכללית", () => {
    expect(groupInviteMessage("https://hopetohelp.github.io/26/#/g/hagzara")).toContain("הקבוצה בקבוצה: https://hopetohelp.github.io/26/#/g/hagzara");
    expect(groupInviteMessage()).toContain("רק לשלוח את הקישור בקבוצה.");
    expect(groupInviteMessage()).not.toContain("#/g/");
  });
  it("מבהירה שזה לא בא במקום סקרים מקיפים אלא ממוקד בהשערת הכנסת הבאה", () => {
    const m = groupInviteMessage();
    expect(m).toContain("לא בא במקום סקרים מקיפים");
    expect(m).toContain("איך תיראה הכנסת הבאה");
  });
  it("אין תאריך מלא בנקודות", () => expect(groupInviteMessage()).not.toMatch(/\d{1,2}\.\d{1,2}\.20\d{2}/));
});
