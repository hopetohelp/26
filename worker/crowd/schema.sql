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

-- העברת דפדפן חד-פעמית מכתובת GitHub לכתובת הפרטית. התוכן מוצפן ב-DATA_KEY;
-- במסד נשמר רק גיבוב של כרטיס המעבר. אחרי אישור קליטה נשמרת קבלה ללא תוכן ל-30 יום.
CREATE TABLE IF NOT EXISTS legacy_handoffs (
  ticket_hash TEXT PRIMARY KEY,
  payload_enc TEXT,
  expires_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS legacy_handoffs_expires ON legacy_handoffs(expires_at);

-- כניסת עוזר AI (שרת ה-MCP; הכרעת בעלים 12.10.2026): נפרדת מסשן הדפדפן, נוצרת רק ממנו (POST /auth/delegate),
-- ומותרת רק בנתיבים שב-lib/agent.js. client = שם העוזר לרשימה "החיבורים שלי". רק הגיבוב של האסימון נשמר.
CREATE TABLE IF NOT EXISTS agent_sessions (
  token_hash TEXT PRIMARY KEY,
  participant TEXT NOT NULL REFERENCES participants(id),
  client TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS agent_sessions_participant ON agent_sessions(participant);

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

-- השיוך האישי במסך "מה השתנה – מפלגות" (הכרעת בעלים 10.10.2026): רשימה של היום ⇐ רשימות 2022, ואופן החלוקה בפיצול.
-- העדפה בלבד — לא נכנסת לסטטיסטיקות. טבלה נפרדת כדי שהקובץ יישאר בר-הרצה חוזרת (בלי ALTER).
CREATE TABLE IF NOT EXISTS lineage_prefs (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  lineage TEXT NOT NULL,
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

-- המייל שאליו נשלח האיפוס (גיבוב) — מסומן מאומת כשהאיפוס מושלם (פתיחת המייל מוכיחה בעלות).
CREATE TABLE IF NOT EXISTS password_reset_email (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  email_hash TEXT NOT NULL
);

-- חשבונות מנהל (הכרעת בעלים 9.10.2026): סשן של חשבון כזה נכנס לממשק הניהול בלי מפתח הניהול. ההגדרה ידנית, במאגר בלבד (לא בקוד).
CREATE TABLE IF NOT EXISTS admins (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  added_at TEXT NOT NULL
);

-- קוד חד-פעמי להגדרת חשבון מנהל (הכרעת בעלים 13.10.2026): נשמר רק הגיבוב, תוקף קצר, ונמחק בשימוש הראשון. הקוד עצמו נמסר לבעלים בלבד.
CREATE TABLE IF NOT EXISTS admin_claims (
  hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- פעילות משתתף לממשק הניהול (הכרעת בעלים 10.10.2026): סשנים נמחקים אחרי שפגו או בוטלו, וגרסאות נמחקות לפי "ההשערה האחרונה של כל יום",
-- לכן המחיקה מגלגלת לכאן את הספירה לפני שהשורות נמחקות. כניסות = logins + הסשנים הקיימים; שמירות = pruned + הגרסאות הקיימות.
CREATE TABLE IF NOT EXISTS participant_activity (
  participant TEXT PRIMARY KEY REFERENCES participants(id),
  logins INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  pruned INTEGER NOT NULL DEFAULT 0
);

-- קבוצות (הכרעת בעלים 11.10.2026, docs/פילוח-קבוצות-תכנון.md): מנהל קבוצה מוסר רשימת מיילים, ונשמר רק הגיבוב שלהם —
-- אותו HMAC של emails.hash, כך שהשיוך הוא הצלבה עם המיילים המאומתים של החשבונות. אין מייל גלוי. השם מוצפן.
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name_enc TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  email_hash TEXT NOT NULL,
  PRIMARY KEY (group_id, email_hash)
);
CREATE INDEX IF NOT EXISTS group_members_hash ON group_members(email_hash);
-- מנהלי קבוצה (הכרעת בעלים 11.10.2026): טוענים רשימה רק לקבוצה שלהם. נשמר גיבוב המייל; תופס כשהמייל מאומת בחשבון.
CREATE TABLE IF NOT EXISTS group_managers (
  group_id TEXT NOT NULL REFERENCES groups(id),
  email_hash TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, email_hash)
);
-- המייל של מנהל קבוצה, מוצפן — להצגת רשימת המנהלים למנהל האתר בלבד (הכרעת בעלים 11.10.2026)
CREATE TABLE IF NOT EXISTS group_manager_labels (
  group_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  email_enc TEXT NOT NULL,
  PRIMARY KEY (group_id, email_hash)
);
-- קישור קבוצה (הכרעת בעלים 12.10.2026): שם באנגלית בכתובת (#/g/<slug>), תמונה שמוצגת בראש סקר האתר, ומונה כניסות דרך הקישור.
-- טבלאות נפרדות (בלי ALTER). המונה אנונימי: ספירה ליום בלבד, בלי זהות. opens = כניסות, fresh = כניסות ראשונות של דפדפן.
CREATE TABLE IF NOT EXISTS group_links (
  group_id TEXT PRIMARY KEY REFERENCES groups(id),
  slug TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS group_images (
  group_id TEXT PRIMARY KEY REFERENCES groups(id),
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_visits (
  group_id TEXT NOT NULL,
  day TEXT NOT NULL,
  opens INTEGER NOT NULL DEFAULT 0,
  fresh INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, day)
);
-- הצטרפות דרך קישור הקבוצה (הכרעת בעלים 23.10.2026): חשבון שנכנס דרך הקישור נרשם כאן (מזהה משתתף, בלי מייל),
-- ונספר כחבר רק אחרי שמנהל הקבוצה הפעיל את המתג. עד אז הרישום שמור ואינו משפיע על דבר.
CREATE TABLE IF NOT EXISTS group_link_joins (
  group_id TEXT NOT NULL,
  participant TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (group_id, participant)
);
CREATE INDEX IF NOT EXISTS group_link_joins_participant ON group_link_joins(participant);
-- מי שהקישור היה הכניסה הראשונה שלו לאתר (הדפדפן לא ביקר קודם), ומתגי המנהל לכל אחד משני הסוגים: all / first
CREATE TABLE IF NOT EXISTS group_link_first (
  group_id TEXT NOT NULL,
  participant TEXT NOT NULL,
  PRIMARY KEY (group_id, participant)
);
-- מתי הדפדפן פתח את הקישור לראשונה (לפי הדפדפן; רק לכניסה ראשונה) — לשיוך הנרשם ליום הפתיחה במשפך הקישור
CREATE TABLE IF NOT EXISTS group_link_opened (
  group_id TEXT NOT NULL,
  participant TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  PRIMARY KEY (group_id, participant)
);
CREATE TABLE IF NOT EXISTS group_link_flags (
  group_id TEXT NOT NULL,
  flag TEXT NOT NULL,
  on_ INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, flag)
);
-- (הוחלף ב-group_link_flags; נשאר ריק)
CREATE TABLE IF NOT EXISTS group_link_policy (
  group_id TEXT PRIMARY KEY,
  include_link INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
-- אישור אוטומטי (הכרעת בעלים 12.10.2026): השערת מנדטים שנמצאה תקינה — בשמירה, או כשנכנסה לטווח הסקרים — מאושרת לצמיתות
-- ולא חוזרת להמתנה. נפרד מ-version_review (אישור ודחייה ידניים), כדי שבממשק הניהול היא תוצג כ"תקינה" ולא כ"אושרה".
CREATE TABLE IF NOT EXISTS version_accepted (
  version_id INTEGER PRIMARY KEY REFERENCES versions(id),
  accepted_at TEXT NOT NULL
);

-- העדפת מקור נפרדת מההשערות; גרסה ומועד שינוי מונעים דריסה בסנכרון.
CREATE TABLE IF NOT EXISTS data_source_prefs (
  participant TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- אישור נוסח הפרטיות (הכרעת בעלים 24.10.2026): הגרסה האחרונה שהמשתמש אישר. גרסה חדשה של הנוסח ⇐ אישור מחדש בכניסה הבאה.
CREATE TABLE IF NOT EXISTS privacy_consents (
  participant TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  accepted_at TEXT NOT NULL
);

-- הסטטיסטיקה המחושבת (הכרעת בעלים 24.10.2026): חישוב אחד לכל היותר פעם בדקה, וכל הבקשות קוראות ממנו.
-- changed_at = שינוי אחרון (POST); computed_at = מועד החישוב; lock_until = נעילה קצרה נגד חישובים מקבילים
CREATE TABLE IF NOT EXISTS dashboard_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  computed_at INTEGER NOT NULL,
  changed_at INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0
);

-- העלאת רשימת קבוצה בשלבים (הכרעת בעלים 24.10.2026): הקובץ נשמר מוצפן בחלקים עד שכל חלק מעובד, ואז נמחק
CREATE TABLE IF NOT EXISTS group_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  total INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  invalid INTEGER NOT NULL DEFAULT 0,
  base INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_upload_parts (
  upload_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  data_enc TEXT NOT NULL,
  PRIMARY KEY (upload_id, idx)
);

-- חיסכון בקריאות (הכרעת בעלים 24.10.2026, docs/תוכנית-חיסכון-קריאות-קבוצות-24-10-2026.md):
-- חיפוש החברות מתחיל מהמיילים המאומתים של המשתמש ומחפש אותם באינדקס, בלי לעבור על כל רשימות הקבוצות.
CREATE INDEX IF NOT EXISTS group_managers_hash ON group_managers(email_hash);
CREATE INDEX IF NOT EXISTS group_link_first_participant ON group_link_first(participant);
-- מספר המיילים בכל קבוצה — נשמר מוכן ומתעדכן אוטומטית בכל הוספה ומחיקה (טריגר), במקום ספירה מלאה בכל פתיחת מסך.
-- שורה חסרה = 0. בכל פרסום של השרת המספר מחושב מחדש מהרשימה עצמה (שתי הפקודות שבסוף), כך שאין סטייה מצטברת.
CREATE TABLE IF NOT EXISTS group_sizes (
  group_id TEXT PRIMARY KEY,
  members INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER IF NOT EXISTS group_members_added AFTER INSERT ON group_members BEGIN
  INSERT OR IGNORE INTO group_sizes (group_id, members) VALUES (NEW.group_id, 0);
  UPDATE group_sizes SET members = members + 1 WHERE group_id = NEW.group_id;
END;
CREATE TRIGGER IF NOT EXISTS group_members_removed AFTER DELETE ON group_members BEGIN
  UPDATE group_sizes SET members = members - 1 WHERE group_id = OLD.group_id;
END;
INSERT INTO group_sizes (group_id, members) SELECT group_id, COUNT(*) FROM group_members WHERE true GROUP BY group_id
  ON CONFLICT(group_id) DO UPDATE SET members = excluded.members;
UPDATE group_sizes SET members = 0 WHERE members <> 0 AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = group_sizes.group_id);

-- גודל רשימת המיילים של כל קבוצה, לכל שעה (נרשם במשימה השעתית) — לגרף "מיילים ברשימה" במסך ניהול קבוצה.
-- מועד הוספת מייל לרשימה אינו נשמר, ולכן ההיסטוריה מתחילה מהפריסה (24.10.2026).
CREATE TABLE IF NOT EXISTS group_size_log (
  group_id TEXT NOT NULL,
  hour TEXT NOT NULL,
  members INTEGER NOT NULL,
  PRIMARY KEY (group_id, hour)
);

-- למה משווים את ממוצע הניחושים של הקבוצה במסך "ממוצע הניחושים" (הכרעת בעלים 24.10.2026): polls = ממוצע הסקרים · crowd = ממוצע כל המשתתפים.
-- נקבע על ידי מנהל הקבוצה; בלי שורה ⇐ polls.
CREATE TABLE IF NOT EXISTS group_compare (
  group_id TEXT PRIMARY KEY,
  ref TEXT NOT NULL CHECK (ref IN ('polls', 'crowd')),
  updated_at TEXT NOT NULL
);

-- אישור אוטומטי לפי כלל ההמתנה של 24.10.2026 (75% מממוצע המשתתפים ו-5 מנדטים מחוץ לטווח הסקרים). מחליף את version_accepted
-- (אישורים לפי הכלל הקודם, שאינם נקראים עוד), כך שהכלל החדש חל רטרואקטיבית על כל ההשערות. החלטות ידניות (version_review) נשארות.
CREATE TABLE IF NOT EXISTS version_accepted_v2 (
  version_id INTEGER PRIMARY KEY REFERENCES versions(id),
  accepted_at TEXT NOT NULL
);

-- כניסות של חשבונות לאתר (הכרעת בעלים 25.10.2026): כניסה אחת לכל פעם שהחשבון פותח את האתר, במרחק של לפחות חצי שעה מהקודמת.
-- לגרף "כניסות" במסך ניהול קבוצה. מזהה חשבון וזמן בלבד.
CREATE TABLE IF NOT EXISTS participant_visits (
  participant TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (participant, at)
);

-- סרטון הנתונים (הכרעת בעלים 26.10.2026): לכל משתתף מחובר — כמה סרטונים יצר, והאם לפחות פעם אחת הוסיף לסרטון
-- את הניחוש שלו (mine) או כתב שם (named). בלי השם עצמו, בלי הניחוש ובלי הסרטון. נמחק עם החשבון.
CREATE TABLE IF NOT EXISTS video_makers (
  participant TEXT PRIMARY KEY,
  videos INTEGER NOT NULL DEFAULT 0,
  mine INTEGER NOT NULL DEFAULT 0,
  named INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL
);

-- כל סרטון שנוצר, עם הסוג והשעה (הכרעת בעלים 28.10.2026): data = סרטון הנתונים · results = סרטון התוצאות. לכרטיסים "מאז 22:00"
CREATE TABLE IF NOT EXISTS video_events (participant TEXT NOT NULL, kind TEXT NOT NULL, mine INTEGER NOT NULL, named INTEGER NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS video_events_at ON video_events (at);

-- שם ציבורי בפודיום הניחושים (הכרעת בעלים 28.10.2026): רק מי שבשלושת המקומות, לבחירתו
CREATE TABLE IF NOT EXISTS podium_names (
  participant TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- סקרי האתר (הכרעת בעלים 01.11.2026: האתר עורך סקרים; docs/תוכנית-אתר-סקרי-הגזרה-01-11-2026.md).
-- סקר שייך לקבוצה; מנהלי הקבוצה ומנהל האתר יוצרים, עורכים, פותחים, סוגרים ומוחקים. def = הגדרת JSON (lib/surveys.js).
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'closed')),
  def TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS surveys_group ON surveys(group_id, status);
-- תשובות: הוספה בלבד — כל שמירה שורה חדשה, כדי שההיסטוריה האישית תציג כל שינוי
CREATE TABLE IF NOT EXISTS survey_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey TEXT NOT NULL,
  participant TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT NOT NULL,
  op_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (participant, survey, op_id)
);
CREATE INDEX IF NOT EXISTS survey_answers_participant ON survey_answers(participant, survey, id);
CREATE INDEX IF NOT EXISTS survey_answers_survey ON survey_answers(survey, participant, id);
-- מי מחוץ לקבוצה רשאי לראות / להשתתף בכל סקר (הכרעת בעלים 01.11.2026): none — לא רואה, view — רואה סקר ותוצאות, answer — משתתף.
-- טבלה נפרדת (ולא עמודה) כי הקובץ רץ מחדש בכל פריסה. אין שורה ⇐ none.
CREATE TABLE IF NOT EXISTS survey_access (
  survey TEXT PRIMARY KEY,
  outside TEXT NOT NULL CHECK (outside IN ('none', 'view', 'answer'))
);
-- הסקר הראשון: הרכבת הממשלה (הגזרה). המנדטים לפי הספירה של 30.10 — מנהל יכול לעדכן את ההגדרה.
INSERT OR IGNORE INTO surveys (id, group_id, status, def, position, created_at, updated_at) VALUES ('gov', 'gy7lelpbo', 'open',
 '{"title":"הרכבת הממשלה","questions":[{"id":"reelect","kind":"single","title":"בחירות חוזרות?","options":[{"id":"yes","label":"כן"},{"id":"no","label":"לא"}]},{"id":"first","kind":"single","title":"על מי יטיל הנשיא את הרכבת הממשלה ראשון?","options":[{"id":"netanyahu","label":"בנימין נתניהו","sub":"הליכוד"},{"id":"eisenkot","label":"גדי איזנקוט","sub":"ישר!"}]},{"id":"coalition","kind":"assign","title":"מי בקואליציה, מי נמנע ומי באופוזיציה?","items":[{"id":"likud","label":"הליכוד","seats":27},{"id":"yashar","label":"ישר!","seats":21},{"id":"together","label":"ביחד","seats":12},{"id":"joint","label":"הרשימה המשותפת","seats":11},{"id":"democrats","label":"הדמוקרטים","seats":8},{"id":"raam","label":"רע\"ם","seats":8},{"id":"utj","label":"יהדות התורה","seats":7},{"id":"yb","label":"ישראל ביתנו","seats":7},{"id":"otzma","label":"עוצמה יהודית","seats":7},{"id":"shas","label":"ש\"ס","seats":6},{"id":"rzp","label":"הציונות הדתית","seats":6}],"columns":[{"id":"coalition","label":"קואליציה"},{"id":"abstain","label":"נמנעים"},{"id":"opposition","label":"אופוזיציה"}]}]}',
 0, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z');

-- הגדרות לכל סקר (הכרעת בעלים 01.11.2026): סוג (סקר / ניחוש), מתי רואים תוצאות, סף משתתפים להצגה, מועד סגירה, ותוצאות אמת בניחוש.
-- טבלה נפרדת (ולא עמודות) כי הקובץ רץ מחדש בכל פריסה. אין שורה ⇐ ברירות המחדל (סקר, רק מי שענה, 50, בלי מועד).
CREATE TABLE IF NOT EXISTS survey_settings (
  survey TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'survey' CHECK (kind IN ('survey', 'guess')),
  visibility TEXT NOT NULL DEFAULT 'answered' CHECK (visibility IN ('now', 'after_close', 'answered')),
  min_results INTEGER NOT NULL DEFAULT 50,
  closes_at TEXT,
  truth TEXT
);
-- כניסות לסקר לסטטיסטיקה למנהלים: ליום, לצופה (משתתף, או גיבוב כתובת למי שלא מחובר), ובנפרד מתוך הטמעה. בלי זהות גלויה.
CREATE TABLE IF NOT EXISTS survey_views (
  survey TEXT NOT NULL,
  day TEXT NOT NULL,
  viewer TEXT NOT NULL,
  embed INTEGER NOT NULL DEFAULT 0,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (survey, day, viewer, embed)
);
-- פיצול "הרכבת הממשלה" לשלושה סקרים נפרדים (הכרעת בעלים 01.11.2026): בחירות חוזרות · על מי יטיל הנשיא · הרכבת הממשלה (שיוך הרשימות).
INSERT OR IGNORE INTO surveys (id, group_id, status, def, position, created_at, updated_at) VALUES ('reelect', 'gy7lelpbo', 'open',
 '{"title":"בחירות חוזרות?","questions":[{"id":"reelect","kind":"single","title":"בחירות חוזרות?","options":[{"id":"yes","label":"כן"},{"id":"no","label":"לא"}]}]}',
 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z');
INSERT OR IGNORE INTO surveys (id, group_id, status, def, position, created_at, updated_at) VALUES ('president', 'gy7lelpbo', 'open',
 '{"title":"על מי יטיל הנשיא את הרכבת הממשלה ראשון?","questions":[{"id":"first","kind":"single","title":"על מי יטיל הנשיא את הרכבת הממשלה ראשון?","options":[{"id":"netanyahu","label":"בנימין נתניהו","sub":"הליכוד"},{"id":"eisenkot","label":"גדי איזנקוט","sub":"ישר!"}]}]}',
 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z');
-- הגישה מחוץ לגזרה עוברת מהסקר המקורי לשניים החדשים (פעם אחת)
INSERT OR IGNORE INTO survey_access (survey, outside) SELECT 'reelect', outside FROM survey_access WHERE survey = 'gov';
INSERT OR IGNORE INTO survey_access (survey, outside) SELECT 'president', outside FROM survey_access WHERE survey = 'gov';
-- תשובות קיימות לשתי השאלות עוברות לסקרים החדשים (אותו מועד; op_id ייחודי ⇐ פעם אחת בלבד)
INSERT OR IGNORE INTO survey_answers (survey, participant, created_at, op_id, payload)
  SELECT 'reelect', participant, created_at, op_id || '~split', json_object('reelect', json_extract(payload, '$.reelect')) FROM survey_answers WHERE survey = 'gov' AND json_extract(payload, '$.reelect') IS NOT NULL;
INSERT OR IGNORE INTO survey_answers (survey, participant, created_at, op_id, payload)
  SELECT 'president', participant, created_at, op_id || '~split', json_object('first', json_extract(payload, '$.first')) FROM survey_answers WHERE survey = 'gov' AND json_extract(payload, '$.first') IS NOT NULL;
-- בסקר "הרכבת הממשלה" נשארת רק שאלת השיוך (רק אם עוד לא פוצל)
UPDATE surveys SET def = json_set(def, '$.questions', json_array(json_extract(def, '$.questions[2]'))), updated_at = '2026-11-01T22:00:00Z'
  WHERE id = 'gov' AND json_array_length(json_extract(def, '$.questions')) = 3 AND json_extract(def, '$.questions[2].kind') = 'assign';
-- שלושת הסקרים הפתוחים הם ניחושים (הכרעת בעלים 02.11.2026). פעם אחת: רק אם עוד אין הגדרות (OR IGNORE)
INSERT OR IGNORE INTO survey_settings (survey, kind) VALUES ('gov', 'guess'), ('reelect', 'guess'), ('president', 'guess');
-- סקר "מה הצבעתם?" (הכרעת בעלים 02.11.2026): כל הרשימות שהתמודדו, כולל שלא עברו את אחוז החסימה, לפי סדר הקולות בתוצאות האמת (raw/results-2026.json); בלי זכות הצבעה, בחרתי לא להצביע, פתק לבן
INSERT OR IGNORE INTO surveys (id, group_id, status, def, position, created_at, updated_at) VALUES ('vote', 'gy7lelpbo', 'open',
 '{"title":"מה הצבעתם?","questions":[{"id":"vote","kind":"single","title":"מה הצבעתם?","options":[{"id":"likud","label":"הליכוד"},{"id":"yashar","label":"ישר!"},{"id":"together","label":"ביחד"},{"id":"joint","label":"הרשימה המשותפת"},{"id":"democrats","label":"הדמוקרטים"},{"id":"yb","label":"ישראל ביתנו"},{"id":"raam","label":"רע\"ם"},{"id":"otzma","label":"עוצמה יהודית"},{"id":"utj","label":"יהדות התורה"},{"id":"shas","label":"ש\"ס"},{"id":"rzp","label":"הציונות הדתית-זהות"},{"id":"reservists","label":"המילואימניקים-הכלכלית"},{"id":"amcha","label":"עמך ישראל"},{"id":"code_black","label":"צבע שחור"},{"id":"haredi_public","label":"הציבור החרדי"},{"id":"noam","label":"נעם לישראל"},{"id":"ineligible","label":"לא הייתה לי זכות הצבעה"},{"id":"none","label":"בחרתי לא להצביע"},{"id":"blank","label":"פתק לבן"}]}]}',
 3, '2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z');
INSERT OR IGNORE INTO survey_settings (survey, kind) VALUES ('vote', 'survey');
INSERT OR IGNORE INTO survey_access (survey, outside) SELECT 'vote', outside FROM survey_access WHERE survey = 'gov';
-- "מה הצבעתם בבחירות הקודמות" — השאלה הקיימת ב"ההצבעה שלי" (v2022) עוברת למבנה הסקרים (הכרעת בעלים 02.11.2026): הרשימות לפי סדר הקולות ב-2022 (כולל שלא עברו) ושלוש האפשרויות של סקר 2026; תשובות "רשימה אחרת" / "מעדיף/ה לא לומר" אינן מועברות, והתשובות הקיימות מועברות (op_id ייחודי ⇐ פעם אחת)
INSERT OR IGNORE INTO surveys (id, group_id, status, def, position, created_at, updated_at) VALUES ('vote2022', 'gy7lelpbo', 'open',
 '{"title":"מה הצבעתם בבחירות הקודמות (2022)?","questions":[{"id":"vote2022","kind":"single","title":"מה הצבעתם בבחירות הקודמות (2022)?","options":[{"id":"מחל","label":"הליכוד"},{"id":"פה","label":"יש עתיד"},{"id":"ט","label":"הציונות הדתית · עוצמה יהודית · נעם"},{"id":"כן","label":"המחנה הממלכתי"},{"id":"שס","label":"ש\"ס"},{"id":"ג","label":"יהדות התורה"},{"id":"ל","label":"ישראל ביתנו"},{"id":"עם","label":"רע\"ם"},{"id":"ום","label":"חד\"ש-תע\"ל"},{"id":"אמת","label":"העבודה"},{"id":"מרצ","label":"מרצ"},{"id":"ד","label":"בל\"ד"},{"id":"ב","label":"הבית היהודי"},{"id":"אצ","label":"חופש כלכלי"},{"id":"קץ","label":"באומץ בשבילך"},{"id":"יז","label":"הכלכלית החדשה"},{"id":"צ","label":"צעירים בוערים בהנהגת הדר מוכתר"},{"id":"ף","label":"הפיראטים- הכי טוב לדעתי אני רוצה להיות ש"},{"id":"ק","label":"קול הסביבה והחי"},{"id":"ת","label":"דעת טוב ורע וברית שבט אברהם-עלה ירוק ואו"},{"id":"ני","label":"נתיב - נחיה תמיד יחד בכבוד"},{"id":"קנ","label":"כל קול קובע נועם קולמן ולירון עופרי לראש"},{"id":"נק","label":"יש כיוון"},{"id":"י","label":"ישראל חופשית דמוקרטית"},{"id":"קך","label":"סדר חדש- למען האזרחים הותיקים בישראל"},{"id":"נץ","label":"העצמאים החדשים"},{"id":"ץ","label":"מנהיגות חברתית"},{"id":"רז","label":"רשימת שלושים\\ארבעים"},{"id":"ך","label":"אני ואתה"},{"id":"ז","label":"שחר כוח חברתי"},{"id":"קי","label":"הלב היהודי"},{"id":"יק","label":"מפלגת הגוש התנ\"כי"},{"id":"נז","label":"כבוד האדם"},{"id":"נר","label":"\"אנחנו\" -"},{"id":"זץ","label":"צומת"},{"id":"יץ","label":"צו השעה"},{"id":"נף","label":"מפלגת שמע"},{"id":"ינ","label":"איחוד בני הברית -בראשות רב חובל בשארה של"},{"id":"זך","label":"קמ\"ה - קידום מעמד הפרט"},{"id":"זנ","label":"כח להשפיע"},{"id":"ineligible","label":"לא הייתה לי זכות הצבעה"},{"id":"none","label":"בחרתי לא להצביע"},{"id":"blank","label":"פתק לבן"}]}]}',
 4, '2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z');
INSERT OR IGNORE INTO survey_settings (survey, kind) VALUES ('vote2022', 'survey');
INSERT OR IGNORE INTO survey_access (survey, outside) SELECT 'vote2022', outside FROM survey_access WHERE survey = 'gov';
INSERT OR IGNORE INTO survey_answers (survey, participant, created_at, op_id, payload)
  SELECT 'vote2022', participant, created_at, op_id || '~v2022', json_object('vote2022', json_extract(payload, '$.v2022')) FROM versions WHERE unit = 'vote' AND json_extract(payload, '$.v2022') IS NOT NULL AND json_extract(payload, '$.v2022') NOT IN ('other', 'private');
-- "רשימה אחרת" ו"מעדיף/ה לא לומר" חוזרות לשני סקרי ההצבעה (הכרעת בעלים 02.11.2026): "רשימה אחרת" אחרי הרשימות, "מעדיף/ה לא לומר" בסוף. פעם אחת — רק אם עוד חסרות
UPDATE surveys SET def = json_set(def, '$.questions[0].options', (
    SELECT json_group_array(json(value)) FROM (
      SELECT value, CASE WHEN json_extract(value, '$.id') IN ('ineligible', 'none', 'blank') THEN 2 ELSE 0 END AS g, key AS k FROM json_each(json_extract(def, '$.questions[0].options'))
      UNION ALL SELECT json_object('id', 'other', 'label', 'רשימה אחרת'), 1, 0
      UNION ALL SELECT json_object('id', 'private', 'label', 'מעדיף/ה לא לומר'), 3, 0
      ORDER BY g, k))), updated_at = '2026-11-02T13:00:00Z'
  WHERE id IN ('vote', 'vote2022') AND NOT EXISTS (SELECT 1 FROM json_each(json_extract(def, '$.questions[0].options')) WHERE json_extract(value, '$.id') = 'private');
-- התשובות הקיימות "רשימה אחרת" / "מעדיף/ה לא לומר" מ-2022 מועברות עכשיו (op_id ייחודי ⇐ פעם אחת)
INSERT OR IGNORE INTO survey_answers (survey, participant, created_at, op_id, payload)
  SELECT 'vote2022', participant, created_at, op_id || '~v2022', json_object('vote2022', json_extract(payload, '$.v2022')) FROM versions WHERE unit = 'vote' AND json_extract(payload, '$.v2022') IN ('other', 'private');
