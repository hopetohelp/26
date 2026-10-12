import { describe, expect, it } from "vitest";
import { conversationTopic, topicMessage } from "./feedbackTopics";

describe("סוג הפנייה שאלה או תאוריה", () => {
  it("השם החדש והשם הקודם מזוהים שניהם", () => {
    expect(conversationTopic([{ author: "visitor", text: topicMessage("theory", "שאלה") }])).toBe("theory");
    expect(conversationTopic([{ author: "visitor", text: "[תאוריה או חישוב] ישנה" }])).toBe("theory");
    expect(conversationTopic([{ author: "visitor", text: topicMessage("data", "תקלה") }])).toBe("data");
    expect(conversationTopic([{ author: "visitor", text: "[נתון שגוי] ישנה" }])).toBe("data");
    expect(conversationTopic([{ author: "visitor", text: "[עיצוב ונוחות] ישנה" }])).toBe("idea");
    expect(conversationTopic([{ author: "visitor", text: "[רעיון] ישנה" }])).toBe("idea");
    expect(conversationTopic([{ author: "visitor", text: "בלי תיוג", topic: "design" }])).toBe("idea");
  });
});
