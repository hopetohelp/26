/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** כתובת שרת הפידבק (worker/feedback). ריק ⇐ כפתור הפידבק אינו מוצג */
  readonly VITE_FEEDBACK_URL?: string;
  /** כתובת הבסיס של שרת ה-MCP (worker/mcp). ריק ⇐ מסך "חיבור עוזר AI" ומגירת "עוזרי AI" מסבירים שהחיבור אינו זמין */
  readonly VITE_MCP_URL?: string;
}
