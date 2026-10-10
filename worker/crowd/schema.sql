-- מאגר השתתפות הגולשים (Cloudflare D1 ‏elections26-crowd) — נפרד לגמרי ממאגר ההערות. השיטה: docs/השתתפות-גולשים.md
-- אין כאן IP, שם או מייל: אסימונים נשמרים מגובבים (SHA-256), IP רק כ-HMAC עם סוד ונמחק אחרי 24 שעות.
-- אין מייל בכלל (הכרעת בעלים 6.10.2026) — השחזור הוא הקישור האישי.
-- זה המצב החי. שינוי — רק בתוספת (ALTER/CREATE), ותיעוד כאן באותו PR.

-- משתתף: מזהה אקראי. review = 1 ⇐ "בבדיקה" (נוצר בשעה חשודה), לא נכנס לממוצע הראשי.
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  review INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS participants_created ON participants(created_at);

-- אמצעי כניסה. link = הקישור האישי (token_hash): /auth/link ⇐ סשן, /auth/recover ⇐ סיסמה חדשה; אינו Bearer · password = שם משתמש+סיסמה · google = שלב עתידי.
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


-- ארכיון תמיכה ישן לקריאה ולהעברה בלבד. כתיבה חדשה ומענה נשמרים בשרת ההערות.
CREATE TABLE IF NOT EXISTS support_threads (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);
CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('visitor','team')),
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_messages_participant ON support_messages(participant, id);

-- ממשק ניהול: רק גיבוב של מפתח הניהול (המפתח עצמו אצל הבעלים בלבד, בקישור הניהול)
CREATE TABLE IF NOT EXISTS admin_keys (hash TEXT PRIMARY KEY, created_at TEXT NOT NULL);

-- העדפות אישיות שאינן השערה ואינן נכנסות לסטטיסטיקות (כרגע: המחנות במסך "מה השתנה"). שורה אחת למשתתף.
CREATE TABLE IF NOT EXISTS prefs (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  camps TEXT,
  updated_at TEXT NOT NULL
);

-- המקור לפני שינוי הרכבי ברירת המחדל נשמר לצורך שחזור וביקורת; אין מזהים חדשים או נתונים ציבוריים.
CREATE TABLE IF NOT EXISTS bloc_migration_backup (
  kind TEXT NOT NULL, id INTEGER NOT NULL, original TEXT NOT NULL, migrated_at TEXT NOT NULL,
  PRIMARY KEY(kind,id)
);

-- שמות תצוגה ציבוריים לפי הרכב בלבד. הצעה אינה מתפרסמת לפני אישור.
CREATE TABLE IF NOT EXISTS bloc_display_names (
  composition TEXT PRIMARY KEY,
  lists TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested', 'approved', 'rejected')),
  suggested_at TEXT NOT NULL,
  approved_at TEXT
);

-- החלטות מנהל על השערות חריגות (worker/crowd/lib/moderation.js). approved = נכנסת לסטטיסטיקות גם אם חריגה · rejected = לא נכנסת לעולם.
-- לפי מזהה גרסה בלבד; גרסה חדשה של אותו גולש נבדקת מחדש. ממשק הניהול אינו מקבל מזהה גרסה או משתתף — רק ידית חד-פעמית.
CREATE TABLE IF NOT EXISTS version_review (
  version_id INTEGER PRIMARY KEY REFERENCES versions(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_at TEXT NOT NULL
);

-- מיילים (הכרעת בעלים 9.10.2026: כל חשבון עם מייל או Google, ולא יותר מחשבון אחד לכל מייל). hash = HMAC של המייל המנורמל
-- (ייחודי — חשבון אחד לכל מייל); enc = המייל מוצפן (AES-GCM), רק להצגה לבעל החשבון. המפתח: הסוד DATA_KEY. אין מייל גלוי במאגר.
-- source: password = נרשם עם המייל · google = מ-Google · added = נוסף לחשבון קיים. verified = 1 רק כשהמייל אומת (Google).
CREATE TABLE IF NOT EXISTS emails (
  hash TEXT PRIMARY KEY,
  participant TEXT NOT NULL REFERENCES participants(id),
  enc TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('password', 'google', 'added')),
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS emails_participant ON emails(participant);

-- שם תצוגה (רשות), מוצפן באותו מפתח. מוצג רק לבעל החשבון.
CREATE TABLE IF NOT EXISTS profile (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  name_enc TEXT,
  updated_at TEXT NOT NULL
);

-- אימות מייל דרך Firebase (הכרעת בעלים 9.10.2026): למשתמש זמני ב-Firebase יש סיסמה אקראית ארוכה, שנשמרת כאן מוצפנת (DATA_KEY) —
-- סיסמת הגולש אינה נשלחת ל-Google. אחרי אימות או מחיקת חשבון השורה והמשתמש ב-Firebase נמחקים.
CREATE TABLE IF NOT EXISTS email_verify (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  fb_enc TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- איפוס סיסמה במייל (הכרעת בעלים 10.10.2026): נשמר רק גיבוב של הסוד החד-פעמי, שנשלח בקישור שבמייל. בקשה חדשה מחליפה את הקודמת; תוקף 30 דקות.
CREATE TABLE IF NOT EXISTS password_reset (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- חשבונות מנהל (הכרעת בעלים 9.10.2026): סשן של חשבון כזה נכנס לממשק הניהול בלי מפתח הניהול. ההגדרה ידנית, במאגר בלבד (לא בקוד).
CREATE TABLE IF NOT EXISTS admins (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  added_at TEXT NOT NULL
);
