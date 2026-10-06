-- מאגר השתתפות הגולשים (Cloudflare D1 ‏elections26-crowd) — נפרד לגמרי ממאגר ההערות. השיטה: docs/השתתפות-גולשים.md
-- אין כאן IP, שם או מייל גלוי: אסימונים נשמרים מגובבים (SHA-256), IP רק כ-HMAC עם סוד ונמחק אחרי 24 שעות,
-- מייל לשחזור מוצפן (AES-GCM) עם גיבוב HMAC נפרד לחיפוש.
-- זה המצב החי. שינוי — רק בתוספת (ALTER/CREATE), ותיעוד כאן באותו PR.

-- משתתף: מזהה אקראי. review = 1 ⇐ "בבדיקה" (נוצר בשעה חשודה), לא נכנס לממוצע הראשי.
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  review INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS participants_created ON participants(created_at);

-- אמצעי כניסה. link = הקישור האישי (token_hash) · password = שם משתמש+סיסמה · google = שלב עתידי.
CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant TEXT NOT NULL REFERENCES participants(id),
  kind TEXT NOT NULL CHECK (kind IN ('link', 'password', 'google')),
  token_hash TEXT UNIQUE,
  username TEXT,
  username_norm TEXT UNIQUE,
  hash TEXT,
  salt TEXT,
  iterations INTEGER,
  algo TEXT,
  google_sub TEXT UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE (participant, kind)
);

-- סשן: אסימון אקראי של 256 ביט בכותרת Authorization; כאן רק הגיבוב. 30 יום.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  participant TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessions_participant ON sessions(participant);

-- כל שמירה = גרסה. op_id ייחודי למשתתף וליחידה ⇐ ניסיון חוזר אינו יוצר כפילות. registry = meta.dataAsOf שעליו נבנתה התשובה.
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant TEXT NOT NULL REFERENCES participants(id),
  unit TEXT NOT NULL CHECK (unit IN ('vote', 'seats', 'blocs')),
  created_at TEXT NOT NULL,
  op_id TEXT NOT NULL,
  registry TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (participant, unit, op_id)
);
CREATE INDEX IF NOT EXISTS versions_participant ON versions(participant, unit, id);

-- מייל לשחזור: מוצפן. key_version מאפשר החלפת מפתח בעתיד. lookup_hmac = HMAC של המייל המנורמל.
CREATE TABLE IF NOT EXISTS recovery_emails (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  lookup_hmac TEXT NOT NULL,
  lookup_key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS recovery_lookup ON recovery_emails(lookup_hmac);

-- מייל שממתין לאימות בעלות: נכנס ל-recovery_emails רק אחרי לחיצה על קישור חד-פעמי (token_hash, 30 דקות).
CREATE TABLE IF NOT EXISTS pending_emails (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  lookup_hmac TEXT NOT NULL,
  lookup_key_version INTEGER NOT NULL DEFAULT 1,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- קישורי איפוס סיסמה: מגובבים, חד-פעמיים, 30 דקות. בקשה חדשה מבטלת את הקודמות.
CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY,
  participant TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- מוני הגבלת קצב. key = סוג + HMAC של IP/חשבון/משתתף. window_start במילישניות. נמחקים אחרי 24 שעות.
CREATE TABLE IF NOT EXISTS rate (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- פרסומי הדשבורד. section = חלק בדשבורד, או 'dashboard' = הקובץ המלא שמוגש. contributors = מספר המשתתפים בחלק;
-- snapshot = מזהי הגרסאות שנספרו (בלי מזהי משתתפים) — כדי לספור "5 משתתפים חדשים/ששינו" עד הפרסום הבא.
CREATE TABLE IF NOT EXISTS aggregates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aggregation_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  section TEXT NOT NULL,
  json TEXT,
  contributors INTEGER NOT NULL DEFAULT 0,
  snapshot TEXT
);
CREATE INDEX IF NOT EXISTS aggregates_section ON aggregates(section, id);

-- שעות שנבדקו בזיהוי חריגות: מספר המשתתפים החדשים, והאם סומנה חשודה. בסיס החציון — שעות מאושרות בלבד.
CREATE TABLE IF NOT EXISTS hours (
  hour TEXT PRIMARY KEY,
  newcomers INTEGER NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0
);

-- היומן הציבורי של ההחרגות. decision: pending = ממתין · excluded = הוחרג · restored = הוחזר (עדכון ידני של הצוות;
-- בהחזרה יש לאפס גם participants.review לאותה שעה, ולעדכן hours.flagged = 0).
CREATE TABLE IF NOT EXISTS review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  hour TEXT NOT NULL,
  rule TEXT NOT NULL,
  segment TEXT NOT NULL,
  participants INTEGER NOT NULL,
  reason TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'excluded', 'restored')),
  aggregation_id TEXT NOT NULL
);
