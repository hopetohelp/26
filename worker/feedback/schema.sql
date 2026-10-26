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

-- פניות שנפתחו בלי חשבון ואוחדו לשיחת החשבון בהרשמה (הכרעת בעלים 9.10.2026). המקור נשמר; במסך הניהול מוצגת רק שיחת החשבון.
CREATE TABLE IF NOT EXISTS feedback_adopted (
  feedback_id INTEGER PRIMARY KEY REFERENCES feedback(id),
  participant TEXT NOT NULL,
  adopted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_adopted_participant ON feedback_adopted(participant);

-- סימוני איפוס של מוני הניהול. failures_from: נפילות (דיווחי כשל אוטומטיים) נספרות רק מרגע זה. ההודעות עצמן לא נמחקות.
-- הערך נקבע ב-11.10.2026: 19:15 שעון ישראל, מועד פתיחת השרתים בנטפרי (הכרעת בעלים); איפוס נוסף = עדכון הערך, לא מחיקת הודעות.
CREATE TABLE IF NOT EXISTS counter_marks (name TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO counter_marks (name, value) VALUES ('failures_from', '2026-10-11T16:15:00.000Z');

-- תמונת מצב של מוני האבחון (diag:*) ברגע איפוס הנפילות. מסך הניהול מציג את ההפרש בלבד; הערכים המלאים נשארים ב-hits.
-- מולא פעם אחת ב-11.10.2026 מתוך hits (38 שורות); איפוס נוסף = העתקה מחדש של שורות diag מ-hits.
CREATE TABLE IF NOT EXISTS counter_baseline (day TEXT NOT NULL, page TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, page));

-- טיוטות תשובה של הסקירה המתוזמנת (הכרעת בעלים 12.10.2026): כשהסוכן אינו בטוח, התשובה נשמרת כאן ואינה מוצגת לגולש.
-- kind = feedback (target = מזהה הפנייה הראשית) או support (target = participant). אישור במסך הניהול מפרסם ומוחק; מחיקה — בלי פרסום.
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('feedback', 'support')),
  target TEXT NOT NULL,
  created_at TEXT NOT NULL,
  text TEXT NOT NULL,
  reason TEXT
);

-- הגדרות. ai_key = מפתח ה-AI שנשמר ממסך הניהול, מוצפן בסוד השרת; לעולם אינו מוחזר מהשרת.
CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

-- ריצות התשובות האוטומטיות (lib/autoReply.js; הכרעת בעלים 14.10.2026): כל פנייה מטופלת פעם אחת לכל הודעה אחרונה של הגולש.
-- outcome = working (בטיפול) · published (פורסמה) · drafted (טיוטה לאישור) · skipped (המודל התעלם; הפנייה נשארת ממתינה) · filtered (נעצרה בקוד לפני המודל; אינה נספרת בתקרה). settings: ai_mode (auto/drafts), ai_status.
CREATE TABLE IF NOT EXISTS ai_runs (
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  last_key TEXT NOT NULL,
  at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (kind, target, last_key)
);

-- מונה יומי לצ'אט הפרטי (lib/privateAsk.js): גיבוב חד-כיווני של המקור עם התאריך בלבד, בלי תוכן ובלי מפתח; נמחק למחרת.
CREATE TABLE IF NOT EXISTS private_hits (
  day TEXT NOT NULL,
  day_key TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, day_key)
);

-- משתתף בהשהיה (הכרעת בעלים 12.10.2026): שאל שאלה שנחשדה כלא עומדת בכללים ⇐ כל תשובה אליו, גם לשאלה ניטרלית, נשמרת כטיוטה עד אישור המשתתף במסך הניהול.
CREATE TABLE IF NOT EXISTS held (
  kind TEXT NOT NULL CHECK (kind IN ('feedback', 'support')),
  target TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT,
  PRIMARY KEY (kind, target)
);

-- חסימה במאגר עצמו למשתתף בהשהיה (הכרעת בעלים 12.10.2026): כל תשובת צוות — דרך השרת, ממסך הניהול, מהסקירה המתוזמנת
-- או בכתיבה ישירה למאגר — הופכת לטיוטה, וסטטוס "נענתה" חוזר ל"ממתינה". עוקף רק אישור טיוטה במסך הניהול:
-- השרת מכניס שורה ל-held_pass באותה אצווה, והטריגר מוחק אותה מיד אחרי שימוש אחד.
CREATE TABLE IF NOT EXISTS held_pass (kind TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY (kind, target));
CREATE TRIGGER IF NOT EXISTS held_feedback_message AFTER INSERT ON messages
WHEN NEW.author = 'team' AND EXISTS (SELECT 1 FROM held WHERE kind = 'feedback' AND target = CAST(COALESCE((SELECT root_id FROM feedback_threads WHERE feedback_id = NEW.feedback_id), NEW.feedback_id) AS TEXT))
BEGIN
  INSERT INTO drafts (kind, target, created_at, text, reason)
    SELECT 'feedback', CAST(COALESCE((SELECT root_id FROM feedback_threads WHERE feedback_id = NEW.feedback_id), NEW.feedback_id) AS TEXT), NEW.created_at, NEW.text, 'משתתף בהשהיה'
    WHERE NOT EXISTS (SELECT 1 FROM held_pass WHERE kind = 'feedback' AND target = CAST(COALESCE((SELECT root_id FROM feedback_threads WHERE feedback_id = NEW.feedback_id), NEW.feedback_id) AS TEXT));
  DELETE FROM messages WHERE id = NEW.id
    AND NOT EXISTS (SELECT 1 FROM held_pass WHERE kind = 'feedback' AND target = CAST(COALESCE((SELECT root_id FROM feedback_threads WHERE feedback_id = NEW.feedback_id), NEW.feedback_id) AS TEXT));
  DELETE FROM held_pass WHERE kind = 'feedback' AND target = CAST(COALESCE((SELECT root_id FROM feedback_threads WHERE feedback_id = NEW.feedback_id), NEW.feedback_id) AS TEXT);
END;
CREATE TRIGGER IF NOT EXISTS held_feedback_status AFTER UPDATE OF status ON feedback
WHEN NEW.status = 'answered' AND EXISTS (SELECT 1 FROM held WHERE kind = 'feedback' AND target = CAST(COALESCE((SELECT root_id FROM feedback_threads WHERE feedback_id = NEW.id), NEW.id) AS TEXT))
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.author = 'team' AND m.created_at >= COALESCE((SELECT MAX(v.created_at) FROM messages v WHERE v.author = 'visitor' AND v.feedback_id = NEW.id), NEW.created_at)
    AND m.feedback_id IN (SELECT feedback_id FROM feedback_threads WHERE root_id = CAST(COALESCE((SELECT root_id FROM feedback_threads WHERE feedback_id = NEW.id), NEW.id) AS INTEGER) UNION SELECT NEW.id))
BEGIN
  UPDATE feedback SET status = 'new' WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS held_support_message AFTER INSERT ON support_messages
WHEN NEW.author = 'team' AND EXISTS (SELECT 1 FROM held WHERE kind = 'support' AND target = NEW.participant)
BEGIN
  INSERT INTO drafts (kind, target, created_at, text, reason)
    SELECT 'support', NEW.participant, NEW.created_at, NEW.text, 'משתתף בהשהיה'
    WHERE NOT EXISTS (SELECT 1 FROM held_pass WHERE kind = 'support' AND target = NEW.participant);
  DELETE FROM support_messages WHERE id = NEW.id AND NOT EXISTS (SELECT 1 FROM held_pass WHERE kind = 'support' AND target = NEW.participant);
  DELETE FROM held_pass WHERE kind = 'support' AND target = NEW.participant;
END;
CREATE TRIGGER IF NOT EXISTS held_support_status AFTER UPDATE OF status ON support_threads
WHEN NEW.status = 'answered' AND EXISTS (SELECT 1 FROM held WHERE kind = 'support' AND target = NEW.participant)
  AND NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.participant = NEW.participant AND m.author = 'team'
    AND m.id > COALESCE((SELECT MAX(v.id) FROM support_messages v WHERE v.participant = NEW.participant AND v.author = 'visitor'), 0))
BEGIN
  UPDATE support_threads SET status = 'new' WHERE participant = NEW.participant;
END;

-- הודעה בשיחת החשבון שנכתבה דרך עוזר AI (שרת ה-MCP; הכרעת בעלים 12.10.2026): שם העוזר, לסימון במסך הניהול.
-- נקבע בשרת לפי כניסת העוזר (GET /support/access בשרת ההשתתפות), לא לפי מה שהעוזר כתב. כל נוהל ההערות חל כרגיל.
CREATE TABLE IF NOT EXISTS support_message_via (
  message_id INTEGER PRIMARY KEY,
  via TEXT NOT NULL
);

-- המפתח האישי לצ'אט החכם (הכרעת בעלים 18.10.2026): לפי חשבון, מוצפן (lib/aiKey.js), לעולם אינו מוחזר ללקוח
CREATE TABLE IF NOT EXISTS private_keys (
  participant TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- שיחות הצ'אט הפרטי (הכרעת בעלים 18.10.2026): לפי חשבון, מוצפנות (lib/aiKey.js), מוחזרות רק לבעליהן
CREATE TABLE IF NOT EXISTS private_chats (
  participant TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- סרטון הנתונים לגולשים לא מחוברים (הכרעת בעלים 26.10.2026): vh = אותו גיבוב של מזהה הדפדפן האקראי כמו ב-visitors_all.
-- כמה סרטונים, והאם לפחות פעם אחת הוסיף את הניחוש שלו (mine) או כתב שם (named). בלי השם, בלי הניחוש ובלי הסרטון.
-- מחוברים נספרים בשרת ההשתתפות (video_makers), לא כאן.
CREATE TABLE IF NOT EXISTS video_anon (
  vh TEXT PRIMARY KEY,
  videos INTEGER NOT NULL DEFAULT 0,
  mine INTEGER NOT NULL DEFAULT 0,
  named INTEGER NOT NULL DEFAULT 0,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL
);
