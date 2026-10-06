/**
 * החוזה בין האתר לשרת ההשתתפות (worker/crowd). מקור אחד לטיפוסים בשני הצדדים — השרת מממש בדיוק את מה שכתוב כאן.
 * השיטה המלאה: docs/השתתפות-גולשים.md
 *
 * זהות: כל בקשה מזוהה נושאת `Authorization: Bearer <token>`. האסימון נוצר בשמירה הראשונה (משתתף אנונימי)
 * או בכניסה בשם משתמש/סיסמה, ונשמר בדפדפן אצל הבעלים היחיד שלו — src/lib/crowdSession.ts.
 *
 * POST /participant                 ⇐ {token}             משתתף אנונימי חדש + אסימון סשן. האסימון הוא גם "הקישור האישי".
 * GET  /me                          ⇐ Me                  מצב המשתתף: הגרסה האחרונה בכל יחידה, אמצעי כניסה.
 * POST /save   SaveRequest          ⇐ {version}           גרסה חדשה ליחידה (op_id ייחודי — ניסיון חוזר מחזיר את אותה גרסה).
 * GET  /history?unit=seats          ⇐ {versions: Version[]}
 * GET  /export                      ⇐ כל נתוני המשתתף (JSON)
 * POST /delete {confirm:"מחק"}      ⇐ {ok}               מחיקה מלאה + ביטול כל הסשנים.
 * POST /link/rotate                 ⇐ {token}             קישור אישי חדש; הקודם מפסיק לעבוד מיד.
 * POST /auth/register {username,password}  ⇐ {token}      מוסיף שם משתמש+סיסמה למשתתף הנוכחי (או יוצר משתתף).
 * POST /auth/login    {username,password}  ⇐ {token}
 * POST /auth/logout   {all?:boolean}       ⇐ {ok}
 * POST /auth/password {current,next}       ⇐ {token}      מחליף סיסמה ומבטל את שאר הסשנים.
 * POST /auth/email    {email|null}         ⇐ {ok}         מוסיף/מסיר מייל לשחזור.
 * POST /auth/forgot   {username}           ⇐ {ok}         תמיד ok (לא חושף קיום); שולח קישור איפוס אם יש מייל.
 * POST /auth/reset    {reset,password}     ⇐ {token}
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
  /** מזהה רשימה 2026 ⇐ ערך. סכום v חייב 120 */
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
  hasEmail: boolean;
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
  publishedAt: string;
  aggregationId: string;
  participants: number;
  /** הדשבורד נפתח מ-30 */
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
  ) {
    super(code);
  }
}

export async function call<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  if (!CROWD_URL) throw new CrowdError(0, "offline");
  const res = await fetch(CROWD_URL + path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: {
      ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  }).catch(() => {
    throw new CrowdError(0, "network");
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CrowdError(res.status, (data as { error?: string }).error ?? "error");
  return data as T;
}
