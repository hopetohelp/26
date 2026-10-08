import { expect, it } from "vitest";
import { conversationTopic, topicMessage } from "./feedbackTopics";
it("סוג הפנייה האחרונה נשמר גם בהמשך שיחה; תשובת צוות אינה משנה סיווג", () => {
  expect(conversationTopic([{author:'visitor',text:'ישן',topic:'data'},{author:'visitor',text:topicMessage('idea','רעיון חדש')},{author:'team',text:'תשובה'}])).toBe('idea');
  expect(conversationTopic([{author:'visitor',text:'פנייה ישנה',topic:'design'}])).toBe('design');
  expect(conversationTopic([{author:'visitor',text:'פנייה בלי סיווג'}])).toBe('other');
});
