/** מקור אחד לסוגי הפניות ולתיוג המשכי שיחה, התואם לשרת ההערות. */
export const FEEDBACK_TOPICS = [
  { id: "data", label: "נתון שגוי" },
  { id: "idea", label: "רעיון" },
  { id: "design", label: "עיצוב ונוחות" },
  { id: "other", label: "אחר" },
] as const;
export type FeedbackTopic = typeof FEEDBACK_TOPICS[number]["id"];
export const topicLabel = (id: string) => FEEDBACK_TOPICS.find(topic => topic.id === id)?.label ?? "אחר";
export const topicMessage = (topic: string, text: string) => `[${topicLabel(topic)}] ${text.trim()}`;
export type TopicMessage = { author: "visitor" | "team"; text: string; topic?: string };
/** סוג הפנייה האחרונה של הגולש, גם בשיחות ישנות; תשובת צוות אינה משנה את הסיווג. */
export function conversationTopic(items: TopicMessage[]): FeedbackTopic {
  const message = [...items].reverse().find(item => item.author === "visitor");
  if (!message) return "other";
  const tagged = FEEDBACK_TOPICS.find(topic => message.text.startsWith(`[${topic.label}] `));
  return tagged?.id ?? FEEDBACK_TOPICS.find(topic => topic.id === message.topic)?.id ?? "other";
}
