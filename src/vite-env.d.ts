/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** כתובת שרת הפידבק (worker/feedback). ריק ⇐ כפתור הפידבק אינו מוצג */
  readonly VITE_FEEDBACK_URL?: string;
}
