/**
 * החוזה בין האתר לשרת ההשתתפות (worker/crowd). מקור אחד לטיפוסים בשני הצדדים — השרת מממש בדיוק את מה שכתוב כאן.
 * השיטה המלאה: docs/השתתפות-גולשים.md
 *
 * זהות: חשבון = שם משתמש + סיסמה, והוא הדרך היחידה לשמור (הכרעת בעלים 6.10.2026) — אין משתתף אנונימי.
 * כל בקשה מזוהה נושאת `Authorization: Bearer <token>` של סשן; הסשן נשמר בדפדפן אצל הבעלים היחיד שלו — src/lib/crowdSession.ts.
 * הקישור האישי נוצר בהרשמה: הוא מכניס ישר להשערות (POST /auth/link ⇐ סשן) ומאפשר לקבוע סיסמה חדשה. הוא עצמו אינו Bearer.
 *
 * POST /auth/register {username,password}  ⇐ {token, link}  משתתף חדש: סיסמה + קישור אישי + סשן.
 * POST /auth/login    {username,password}  ⇐ {token}
 * POST /auth/logout   {all?:boolean}       ⇐ {ok}
 * POST /auth/password {current,next}       ⇐ {token}       קובע סיסמה (הנוכחית חובה) ומבטל את שאר הסשנים; הקישור נשאר.
 * POST /auth/link     {link}               ⇐ {token, username}  כניסה בקישור האישי ⇐ סשן רגיל. עיכוב מדורג כמו בכניסה.
 * POST /auth/recover  {link,password}      ⇐ {token, username}  שחזור: הקישור האישי + סיסמה חדשה ⇐ סשן רגיל;
 *                                                         מבטל את שאר הסשנים, הקישור נשאר. עיכוב מדורג כמו בכניסה.
 * GET  /me                          ⇐ Me                  מצב המשתתף: הגרסה האחרונה בכל יחידה, שם המשתמש.
 * POST /save   SaveRequest          ⇐ {version}           גרסה חדשה ליחידה (op_id ייחודי — ניסיון חוזר מחזיר את אותה גרסה).
 * GET  /history?unit=seats          ⇐ {versions: Version[]}
 * GET  /export                      ⇐ כל נתוני המשתתף (JSON)
 * POST /delete {confirm:"מחק"}      ⇐ {ok}               מחיקה מלאה + ביטול כל הסשנים.
 * POST /link/rotate                 ⇐ {link}              קישור אישי חדש (בסשן); הקודם מפסיק לעבוד מיד.
 *
 * אין מייל בכלל (הכרעת בעלים 6.10.2026): אין שליחת מיילים, אין איפוס במייל. השחזור = הקישור האישי.
 * GET  /dashboard                   ⇐ Dashboard            צבירה מפורסמת (ציבורי, בלי זהות).
 * GET  /log                         ⇐ {entries: LogEntry[]} יומן ההחרגות הציבורי.
 */

export const CROWD_URL = import.meta.env.VITE_CROWD_URL as string | undefined;

export type Unit = "vote" | "seats" | "blocs";

/** 2022: מזהה רשימה מ-results (k25, לפי letters) או קוד מיוחד */
export type Vote2022 = string | "other" | "none" | "blank" | "ineligible" | "private";
/** 2026: מזהה רשימה מ-meta.lists2026 או קוד מיוחד */
export type Vote2026 = string | "undecided" | "none" | "private";

export interface VotePayload {
  v2022: Vote2022 | null;
  v2026: Vote2026 | null;
}

export interface SeatCell {
  v: number;
  src: "manual" | "filled";
  locked: boolean;
}

export interface SeatsPayload {
  /** "seats" = ניחוש לפי מנדטים (ברירת המחדל, גם כשחסר) · "pct" = לפי אחוזי הצבעה, והמנדטים מחושבים במנוע החוק */
  mode?: "seats" | "pct";
  /** במצב pct: אחוז מהקולות הכשרים לכל רשימה (0..100, ספרה אחת אחרי הנקודה, סכום ≤ 100; היתר = אחרות / לא עברו) */
  pct?: Record<string, number>;
  /** מזהה רשימה 2026 ⇐ ערך. סכום v חייב 120 (גם במצב pct — כפי שחישב המנוע) */
  seats: Record<string, SeatCell>;
  start: "zero" | "k25" | "polls";
  /** תאריך תמונת ממוצע הסקרים ששימשה (פתיחה או "השלם הכול") */
  pollsAsOf: string | null;
}

export interface Bloc {
  id: string;
  name: string;
  lists: string[];
  /** null = לא נוחש · 0 = אפס */
  target: number | null;
}

export interface BlocsPayload {
  /** "gov37" = ברירת המחדל (מפלגות הממשלה היוצאת / שאר הרשימות) · "custom" = גושים של המשתמש */
  mode: "gov37" | "custom";
  blocs: Bloc[];
}

export type Payload = VotePayload | SeatsPayload | BlocsPayload;

export interface Version<P = Payload> {
  id: number;
  unit: Unit;
  created_at: string;
  payload: P;
}

export interface SaveRequest {
  unit: Unit;
  op_id: string;
  /** גרסת המרשם (meta.dataAsOf) שעליה נבנתה התשובה */
  registry: string;
  payload: Payload;
}

export interface Me {
  participant: string;
  created_at: string;
  latest: Partial<Record<Unit, Version>>;
  username: string | null;
  google: boolean;
}

/** מספר עם המונה והמכנה שלו. hidden = מתחת לסף */
export interface Cell {
  n: number;
  of: number;
  hidden?: boolean;
}

export interface SeatStat {
  list: string;
  n: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
}

export interface Dashboard {
  /** מועד הפרסום — "נכון ל-" */
  publishedAt: string | null;
  aggregationId: string | null;
  /** מועד הפרסום של כל חלק — חלק קפוא לא משתנה גם כשהצבירה רצה */
  sectionsAsOf?: Record<string, string>;
  participants: number;
  /** הדשבורד פתוח גם במספר משתתפים קטן; כל חלק עם תשובות מוצג. */
  open: boolean;
  seats?: {
    n: number;
    full: SeatStat[];
    /** "בקרב מי שקבעו ערך לרשימה" — לכל רשימה n משלה */
    manual: SeatStat[];
    filledShare: number;
    usedFillAll: number;
    pollsAsOf: string | null;
    polls: Record<string, number>;
    starts: Record<"zero" | "k25" | "polls", number>;
    /** כמה ניחשו לפי מנדטים וכמה לפי אחוזים */
    modes?: { seats: number; pct: number };
    /** אחוזי ההצבעה שניחשו, בקרב מי שניחשו לפי אחוזים (מתשובה אחת) */
    pctStats?: SeatStat[];
  };
  blocs?: {
    derived: { gov: SeatStat; rest: SeatStat } | null;
    explicit: { gov: SeatStat | null; rest: SeatStat | null } | null;
    customCount: number;
  };
  vote2026?: { all: Record<string, Cell>; named: Record<string, Cell> };
  vote2022?: { all: Record<string, Cell>; valid: Record<string, Cell>; official: Record<string, number> };
  /** שורה = 2022, עמודה = 2026, אחוז מהשורה */
  matrix?: { rows: Record<string, { n: number; hidden?: boolean; cells: Record<string, Cell> }>; publishedAt: string };
  /** השערות מנדטים לפי כוונת הצבעה 2026 */
  byVote?: Record<string, { n: number; seats: Record<string, number> }>;
  trend?: { day: string; n: number; newcomers: number; changed: number; seats: Record<string, number> }[];
  underReview?: { participants: number; seats: SeatStat[] } | null;
}

export interface LogEntry {
  at: string;
  rule: string;
  segment: string;
  participants: number;
  reason: string;
  decision: "pending" | "excluded" | "restored";
  aggregationId: string;
}

export class CrowdError extends Error {
  constructor(
    public status: number,
    public code: string,
    public diagnostic?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function call<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  if (!CROWD_URL) throw new CrowdError(0, "offline");
  const started = Date.now();
  const context = () => ({
    at: new Date().toISOString(),
    endpoint: CROWD_URL + path.split("?")[0],
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    elapsedMs: Date.now() - started,
    online: navigator.onLine,
    browser: navigator.userAgent,
  });
  const res = await fetch(CROWD_URL + path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: {
      ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  }).catch((cause: unknown) => {
    // בלי גוף הבקשה, כותרות או כתובת העמוד: הם עשויים להכיל פרטי כניסה וקישורים אישיים.
    const clean = (s: string) => {
      const urls = s.replace(/https?:\/\/[^\s)]+/g, (url) => url.split(/[?#]/)[0]);
      return opts.token ? urls.split(opts.token).join("[הוסר]") : urls;
    };
    throw new CrowdError(0, "network", {
      ...context(),
      cause: cause instanceof Error ? { name: cause.name, message: clean(cause.message), stack: clean(cause.stack ?? "") } : { name: "UnknownError" },
    });
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CrowdError(res.status, (data as { error?: string }).error ?? "error", { ...context(), status: res.status });
  return data as T;
}
