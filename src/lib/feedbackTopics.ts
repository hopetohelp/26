/** מקור אחד לסוגי הפניות ולתיוג המשכי שיחה, התואם לשרת ההערות. */
export const FEEDBACK_TOPICS = [
  // תקלה או שגיאה — כולל נתון שגוי (שם קודם: "נתון שגוי", הכרעת בעלים 12.10.2026)
  { id: "data", label: "תקלה או שגיאה" },
  // רעיון לשיפור — איחוד "רעיון" ו"עיצוב ונוחות" (הכרעת בעלים 12.10.2026)
  { id: "idea", label: "רעיון לשיפור" },
  // שאלה או תאוריה על הבחירות (הכרעת בעלים 12.10.2026): תשובה על פי הנתונים בשלוש נקודות — docs/נוהל-הערות.md
  { id: "theory", label: "שאלה או תאוריה" },
  { id: "other", label: "אחר" },
] as const;
/** שמות קודמים של סוגי פניות — פניות ישנות עדיין מזוהות לפיהם */
const LEGACY_LABELS: Record<string, "data" | "idea" | "theory"> = { "נתון שגוי": "data", "רעיון": "idea", "עיצוב ונוחות": "idea", "תאוריה או חישוב": "theory" };
/** סוגים קודמים בשרת: "design" אוחד ל"idea" */
const LEGACY_IDS: Record<string, "idea"> = { design: "idea" };
export type FeedbackTopic = typeof FEEDBACK_TOPICS[number]["id"];
export const topicLabel = (id: string) => FEEDBACK_TOPICS.find(topic => topic.id === id)?.label ?? "אחר";
export const topicMessage = (topic: string, text: string) => `[${topicLabel(topic)}] ${text.trim()}`;
export type TopicMessage = { author: "visitor" | "team"; text: string; topic?: string };
/** סוג הפנייה האחרונה של המשתתף, גם בשיחות ישנות; תשובת צוות אינה משנה את הסיווג. */
export function conversationTopic(items: TopicMessage[]): FeedbackTopic {
  const message = [...items].reverse().find(item => item.author === "visitor");
  if (!message) return "other";
  const tagged = FEEDBACK_TOPICS.find(topic => message.text.startsWith(`[${topic.label}] `)) ?? Object.entries(LEGACY_LABELS).map(([label, id]) => ({ label, id })).find(legacy => message.text.startsWith(`[${legacy.label}] `));
  return tagged?.id ?? FEEDBACK_TOPICS.find(topic => topic.id === message.topic)?.id ?? (message.topic ? LEGACY_IDS[message.topic] : undefined) ?? "other";
}
