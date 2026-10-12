-- מאגר שרת ה-MCP (elections26-mcp). רץ בכל פריסה — CREATE IF NOT EXISTS בלבד; שינוי רק בתוספת.
-- 🔴 אין כאן מזהה משתתף, מייל, שם או כתובת IP. כניסת העוזר של המשתמש (מ-worker/crowd) נשמרת מוצפנת בלבד (DATA_KEY).

-- לקוחות OAuth (הרשמה דינמית, RFC 7591): עוזר שמתחבר רושם את עצמו. רישום לבדו אינו נותן גישה — רק אישור המשתמש באתר.
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- בקשת התחברות שממתינה לאישור המשתמש במסך "חיבור עוזר AI" באתר (10 דקות)
CREATE TABLE IF NOT EXISTS auth_requests (
  id_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  state TEXT,
  created_at INTEGER NOT NULL
);

-- קוד חד-פעמי אחרי האישור (5 דקות)
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  agent_enc TEXT NOT NULL,
  agent_expires TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- חיבור מאושר: כניסת העוזר מוצפנת. נמחק כשהמשתמש מנתק באתר (שרת ההשתתפות עונה 401) או כשפג.
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  agent_enc TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- אסימוני גישה (שעה) ורענון (עד סוף החיבור, מתחלף בכל שימוש). רק הגיבוב.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_grant ON tokens(grant_id);

-- הגבלת קצב: מונים בחלונות של שעה (מפתח = גיבוב החיבור, או גיבוב כתובת הרשת לכתובת הציבורית). נמחקים אחרי יממה.
CREATE TABLE IF NOT EXISTS rate (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- תיעוד שימוש בלי פרטים מזהים: כמה קריאות לכל כלי, לפי יום, סוג הכתובת, שם העוזר והתוצאה.
CREATE TABLE IF NOT EXISTS usage (
  day TEXT NOT NULL,
  tool TEXT NOT NULL,
  mode TEXT NOT NULL,
  client TEXT NOT NULL,
  outcome TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, tool, mode, client, outcome)
);

-- הגדרות שמנהל האתר משנה מהמסך (מגירת "שרת ה-MCP"): public_enabled — האם הכתובת בלי התחברות פתוחה ('1' / '0')
CREATE TABLE IF NOT EXISTS settings (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- דשבורד למנהל (הכרעת בעלים 12.10.2026): לכל יום ולכל כתובת (public · mcp) — חיבורים, שיחות, קריאות וכתיבות. בלי מזהים.
CREATE TABLE IF NOT EXISTS stats (
  day TEXT NOT NULL,
  mode TEXT NOT NULL,
  metric TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, mode, metric)
);

-- מתי נראה לאחרונה כל חיבור (גיבוב בלבד) — כדי לספור "שיחה" (רצף קריאות בלי הפסקה של 30 דקות) ו"חיבור" ביום. נמחק אחרי יומיים.
CREATE TABLE IF NOT EXISTS seen (
  key TEXT PRIMARY KEY,
  last_at INTEGER NOT NULL
);
