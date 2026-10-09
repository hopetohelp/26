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

-- איחוד שיחות רק אחרי הוכחת בעלות בכל הקישורים. הרשומות והקישורים המקוריים נשמרים.
CREATE TABLE IF NOT EXISTS feedback_threads (
  feedback_id INTEGER PRIMARY KEY REFERENCES feedback(id),
  root_id INTEGER NOT NULL REFERENCES feedback(id)
);
CREATE INDEX IF NOT EXISTS feedback_threads_root ON feedback_threads(root_id);

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

-- ספירה מצטברת של גולשים: vh = גיבוב של מזהה אקראי שנשמר בדפדפן של הגולש (לא נגזר מ-IP או מפרט אחר).
-- אין כאן כתובת או שום פרט אחר. גולשים בסך הכול = COUNT(*); חוזרים = first_day < last_day.
CREATE TABLE IF NOT EXISTS visitors_all (
  vh TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL
);

-- ממשק ניהול: רק גיבוב של מפתח הניהול (המפתח עצמו אצל הבעלים בלבד, בקישור הניהול)
CREATE TABLE IF NOT EXISTS admin_keys (hash TEXT PRIMARY KEY, created_at TEXT NOT NULL);

-- תמיכת חשבונות הועברה לכאן. מאגר החשבונות נשאר מקור האימות בלבד.
CREATE TABLE IF NOT EXISTS support_threads (
  participant TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);
CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant TEXT NOT NULL REFERENCES support_threads(participant),
  created_at TEXT NOT NULL,
  author TEXT NOT NULL CHECK(author IN ('visitor', 'team')),
  text TEXT NOT NULL,
  legacy_key TEXT UNIQUE,
  op_id TEXT,
  UNIQUE(participant, op_id)
);
CREATE INDEX IF NOT EXISTS support_messages_participant ON support_messages(participant, created_at, id);

-- פרטיות (בדיקת אבטחה 9.10.2026): day_key נחוץ רק להגבלת הקצב של היום. מגיבוב ישן אפשר היה לשחזר כתובת IP בניסוי כל הכתובות,
-- ולכן הוא נמחק מכל רשומה בת יותר מיומיים. רץ בכל פריסה; אינו נוגע בתוכן ההערות.
UPDATE feedback SET day_key = '' WHERE day_key <> '' AND created_at < date('now', '-2 day');
UPDATE messages SET day_key = NULL WHERE day_key IS NOT NULL AND created_at < date('now', '-2 day');
