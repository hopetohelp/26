import { describe, expect, it } from "vitest";
import { conversationTopic, topicMessage } from "./feedbackTopics";

describe("סוג הפנייה שאלה או תאוריה", () => {
  it("השם החדש והשם הקודם מזוהים שניהם", () => {
    expect(conversationTopic([{ author: "visitor", text: topicMessage("theory", "שאלה") }])).toBe("theory");
    expect(conversationTopic([{ author: "visitor", text: "[תאוריה או חישוב] ישנה" }])).toBe("theory");
    expect(conversationTopic([{ author: "visitor", text: topicMessage("data", "תקלה") }])).toBe("data");
    expect(conversationTopic([{ author: "visitor", text: "[נתון שגוי] ישנה" }])).toBe("data");
    // הכרעת בעלים 25.10.2026: כל מה שאינו שאלה או תאוריה — תקלה או שיפור, גם בפניות ישנות
    for (const old of ["עיצוב ונוחות", "רעיון", "תקלה או שגיאה", "רעיון לשיפור", "אחר"]) expect(conversationTopic([{ author: "visitor", text: `[${old}] ישנה` }])).toBe("data");
    for (const topic of ["design", "idea", "other"]) expect(conversationTopic([{ author: "visitor", text: "בלי תיוג", topic }])).toBe("data");
    expect(conversationTopic([{ author: "visitor", text: "בלי תיוג" }])).toBe("data");
    // הכרעת בעלים 01.11.2026: "תקלה או טעות" / "שיפור או שאלה"; שיחות עם השמות הקודמים ממשיכות להיות מזוהות
    expect(topicMessage("data", "x")).toBe("[תקלה או טעות] x");
    expect(topicMessage("theory", "x")).toBe("[שיפור או שאלה] x");
    expect(conversationTopic([{ author: "visitor", text: "[שאלה או תאוריה] ישנה" }])).toBe("theory");
    expect(conversationTopic([{ author: "visitor", text: "[תקלה או שיפור] ישנה" }])).toBe("data");
  });
});
