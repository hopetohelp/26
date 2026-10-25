/** מקור אחד לסוגי הפניות ולתיוג המשכי שיחה, התואם לשרת ההערות. */
export const FEEDBACK_TOPICS = [
  // תקלה או שיפור — כל פנייה שאינה שאלה או תאוריה (הכרעת בעלים 25.10.2026: איחוד "תקלה או שגיאה", "רעיון לשיפור" ו"אחר")
  { id: "data", label: "תקלה או שיפור" },
  // שאלה או תאוריה על הבחירות (הכרעת בעלים 12.10.2026): תשובה על פי הנתונים בשלוש נקודות — docs/נוהל-הערות.md
  { id: "theory", label: "שאלה או תאוריה" },
] as const;
/** שמות קודמים של סוגי פניות — פניות ישנות עדיין מזוהות לפיהם */
const LEGACY_LABELS: Record<string, "data" | "theory"> = { "נתון שגוי": "data", "רעיון": "data", "עיצוב ונוחות": "data", "תקלה או שגיאה": "data", "רעיון לשיפור": "data", "אחר": "data", "תאוריה או חישוב": "theory" };
/** סוגים קודמים בשרת — כולם אוחדו ל"תקלה או שיפור" */
const LEGACY_IDS: Record<string, "data"> = { design: "data", idea: "data", other: "data" };
export type FeedbackTopic = typeof FEEDBACK_TOPICS[number]["id"];
export const topicLabel = (id: string) => FEEDBACK_TOPICS.find(topic => topic.id === id)?.label ?? "תקלה או שיפור";
export const topicMessage = (topic: string, text: string) => `[${topicLabel(topic)}] ${text.trim()}`;
export type TopicMessage = { author: "visitor" | "team"; text: string; topic?: string };
/** סוג הפנייה האחרונה של המשתתף, גם בשיחות ישנות; תשובת צוות אינה משנה את הסיווג. */
export function conversationTopic(items: TopicMessage[]): FeedbackTopic {
  const message = [...items].reverse().find(item => item.author === "visitor");
  if (!message) return "data";
  const tagged = FEEDBACK_TOPICS.find(topic => message.text.startsWith(`[${topic.label}] `)) ?? Object.entries(LEGACY_LABELS).map(([label, id]) => ({ label, id })).find(legacy => message.text.startsWith(`[${legacy.label}] `));
  return tagged?.id ?? FEEDBACK_TOPICS.find(topic => topic.id === message.topic)?.id ?? (message.topic ? LEGACY_IDS[message.topic] : undefined) ?? "data";
}
