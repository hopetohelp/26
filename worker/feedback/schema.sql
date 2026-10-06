-- מאגר ההערות של כפתור הפידבק (Cloudflare D1 ‏elections26-feedback, חשבון האתר). אין כאן שום פרט מזהה:
-- day_key = גיבוב חד-כיווני של כתובת ה-IP עם התאריך — רק להגבלת קצב, ואי אפשר לשחזר ממנו את הכתובת.
-- token_hash = גיבוב הקישור האישי של הגולש. הקישור עצמו אינו נשמר, ולכן גם מי שקורא את המאגר אינו יכול לפתוח שיחה.
-- status: new = ממתינה לתשובה (גם אחרי תגובה חדשה של הגולש) · answered = נענתה · closed = נסגרה.
-- זה המצב החי. שינוי — רק בתוספת (ALTER/CREATE), ותיעוד כאן באותו PR.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  topic TEXT NOT NULL,
  text TEXT NOT NULL,
  page TEXT,
  theme TEXT,
  day_key TEXT NOT NULL,
  token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS feedback_day_key ON feedback(day_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS feedback_token ON feedback(token_hash);

-- השיחה על הערה: תשובות הצוות (נכתבות ישירות כאן, לא דרך השרת) ותגובות הגולש (דרך השרת).
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id INTEGER NOT NULL REFERENCES feedback(id),
  created_at TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('team', 'visitor')),
  text TEXT NOT NULL,
  day_key TEXT
);
CREATE INDEX IF NOT EXISTS messages_feedback ON messages(feedback_id, id);
CREATE INDEX IF NOT EXISTS messages_day_key ON messages(day_key, created_at);

-- מונה כניסות: מספר הצפיות לכל עמוד בכל יום (UTC). אין כאן IP, עוגייה או מזהה כלשהו — רק ספירה.
CREATE TABLE IF NOT EXISTS hits (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page)
);

-- גולשים שונים ביום ובעמוד. vid = גיבוב חד-כיווני של IP + דפדפן + התאריך: מתחלף מדי יום, ולכן אי אפשר לשחזר ממנו כתובת
-- או לעקוב אחרי גולש בין ימים. גולשים ביום = COUNT(DISTINCT vid) לאותו day.
CREATE TABLE IF NOT EXISTS visitors (
  day TEXT NOT NULL,
  vid TEXT NOT NULL,
  page TEXT NOT NULL,
  PRIMARY KEY (day, vid, page)
);
