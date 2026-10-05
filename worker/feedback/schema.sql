-- מאגר ההערות של כפתור הפידבק (Cloudflare D1, חשבון האתר). אין כאן שום פרט מזהה:
-- day_key = גיבוב חד-כיווני של כתובת ה-IP עם מלח שמתחלף כל יום — רק להגבלת קצב, ואי אפשר לשחזר ממנו את הכתובת.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  topic TEXT NOT NULL,
  text TEXT NOT NULL,
  page TEXT,
  theme TEXT,
  day_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_day_key ON feedback(day_key, created_at);
