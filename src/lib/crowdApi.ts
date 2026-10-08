/**
 * החוזה בין האתר לשרת ההשתתפות (worker/crowd). מקור אחד לטיפוסים בשני הצדדים — השרת מממש בדיוק את מה שכתוב כאן.
 * השיטה המלאה: docs/השתתפות-גולשים.md
 *
 * זהות: חשבון = שם משתמש + סיסמה (מומלץ), או שמירה בלי משתמש — "אורח" בלי שחזור (הכרעת בעלים 8.10.2026).
 * כל בקשה מזוהה נושאת `Authorization: Bearer <token>` של סשן; הסשן נשמר בדפדפן אצל הבעלים היחיד שלו — src/lib/crowdSession.ts.
 * הקישור האישי נוצר בהרשמה: הוא מכניס ישר להשערות (POST /auth/link ⇐ סשן) ומאפשר לקבוע סיסמה חדשה. הוא עצמו אינו Bearer.
 *
 * POST /auth/register {username,password}  ⇐ {token, link}  משתתף חדש: סיסמה + קישור אישי + סשן.
 * POST /auth/guest   {}                    ⇐ {token}       שמירה בלי משתמש (הכרעת בעלים 8.10.2026): בלי סיסמה ובלי קישור אישי, ולכן בלי שחזור.
 * POST /auth/claim   {username,password}   ⇐ {username, link}  (בסשן) הוספת שם משתמש וסיסמה לאורח; נוצר קישור אישי.
 * GET|POST /ping                      ⇐ {ok}          בדיקת חיבור, בלי זהות ובלי מאגר.
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

const feedbackUrl = import.meta.env.VITE_FEEDBACK_URL as string | undefined;
const directUrl = (import.meta.env.VITE_CROWD_URL as string | undefined)?.replace(/\/$/, "");
const gatewayUrl = feedbackUrl ? feedbackUrl.replace(/\/$/, "") + "/crowd" : undefined;
export const CROWD_URL = gatewayUrl ?? directUrl;
/**
 * שני מסלולים לאותו שרת: דרך שרת ההערות (gateway) וישירות. כשבקשה נכשלת ברשת במסלול אחד — מנסים את השני,
 * והמסלול שעבד נשאר בשימוש לשאר הביקור. כשחוסמים כתובת אחת ברשת, השנייה יכולה לעבור.
 */
const BASES = [...new Set([gatewayUrl, directUrl].filter((u): u is string => !!u))];
let preferred = 0;

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
  /** קלט המחשבון לצורך שחזור השערה שמורה. */
  calculation?: { turnout: number; eligible: number; agreements: string[][] };
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
  /** נשמר בלי שם משתמש וסיסמה (POST /auth/guest): אי אפשר לשחזר אם הסשן אבד */
  guest: boolean;
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
  min: number;
  max: number;
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
  /** משתתפים ייחודיים בכל חלק, ללא ספירה כפולה בין יחידות. */
  sectionParticipants?: Record<string, number>;
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
    /** גושים בעלי אותו הרכב רשימות, ללא תלות בשם או בסדר; אין ערבוב בין הרכבים שונים. */
    custom?: { name: string; lists: string[]; n: number; explicit: SeatStat | null; derived: SeatStat | null }[];
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

/** מנסה מסלול אחד; כשל ברשת נזרק כ-CrowdError("network") עם לוג בלי פרטים אישיים */
async function attempt(base: string, path: string, opts: { method?: string; body?: unknown; token?: string | null }, started: number): Promise<Response> {
  const context = () => ({
    at: new Date().toISOString(),
    endpoint: base + path.split("?")[0],
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    elapsedMs: Date.now() - started,
    online: navigator.onLine,
    browser: navigator.userAgent,
  });
  try {
    return await fetch(base + path, {
      cache: path.split("?")[0] === "/dashboard" ? "no-store" : "default",
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (cause: unknown) {
    // בלי גוף הבקשה, כותרות או כתובת העמוד: הם עשויים להכיל פרטי כניסה וקישורים אישיים.
    const clean = (s: string) => {
      const urls = s.replace(/https?:\/\/[^\s)]+/g, (url) => url.split(/[?#]/)[0]);
      const body = opts.body && typeof opts.body === "object" ? opts.body as Record<string, unknown> : {};
      const secrets = [opts.token, ...["username", "password", "current", "next", "link"].map((key) => body[key])];
      return secrets.reduce<string>((text, secret) => typeof secret === "string" && secret ? text.split(secret).join("[הוסר]") : text, urls);
    };
    throw new CrowdError(0, "network", {
      ...context(),
      cause: cause instanceof Error ? { name: cause.name, message: clean(cause.message), stack: clean(cause.stack ?? "") } : { name: "UnknownError" },
    });
  }
}

export async function call<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  if (!BASES.length) throw new CrowdError(0, "offline");
  const started = Date.now();
  let res: Response | undefined;
  let first: CrowdError | undefined;
  for (let i = 0; i < BASES.length && !res; i++) {
    const idx = (preferred + i) % BASES.length;
    try {
      res = await attempt(BASES[idx], path, opts, started);
      if (i > 0) {
        preferred = idx; // המסלול שעבד נשאר בשימוש
        reportDiag("fallback-saved");
      }
    } catch (e) {
      first ??= e as CrowdError;
    }
  }
  if (!res) {
    reportFailure(path, first!.diagnostic);
    throw first!;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new CrowdError(res.status, (data as { error?: string }).error ?? "error", {
      at: new Date().toISOString(),
      endpoint: res.url ? res.url.split(/[?#]/)[0] : undefined,
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      elapsedMs: Date.now() - started,
      online: navigator.onLine,
      browser: navigator.userAgent,
      status: res.status,
    });
  return data as T;
}

// ---- בדיקת חיבור: מה בדיוק נחסם? (נשלחת רק אחרי כשל, ומדווחת למונה אנונימי)
export type ConnectionKind = "all-ok" | "all-blocked" | "feedback-only" | "direct-only" | "gateway-only" | "post-blocked" | "password-blocked" | "fallback-saved";
export interface ConnectionCheck {
  kind: ConnectionKind;
  /** תוצאה לכל בדיקה: true = עבר */
  probes: Record<"feedback" | "gateway" | "direct" | "post" | "postPassword", boolean | null>;
}

async function probe(url: string | undefined, body?: unknown): Promise<boolean | null> {
  if (!url) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal, cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function classifyConnection(p: ConnectionCheck["probes"]): ConnectionKind {
  const crowd = [p.gateway, p.direct, p.post, p.postPassword].filter((x) => x !== null);
  if (crowd.every((x) => x) && p.feedback !== false) return "all-ok";
  if (p.feedback === false && crowd.every((x) => x === false)) return "all-blocked";
  if (p.feedback && crowd.every((x) => x === false)) return "feedback-only";
  if (p.gateway === false && p.direct) return "direct-only";
  if (p.direct === false && p.gateway) return "gateway-only";
  if (p.post === false) return "post-blocked";
  if (p.postPassword === false) return "password-blocked";
  return "all-ok";
}

export async function checkConnection(): Promise<ConnectionCheck> {
  const [feedback, gateway, direct, post, postPassword] = await Promise.all([
    probe(feedbackUrl ? feedbackUrl.replace(/\/$/, "") + "/ping" : undefined),
    probe(gatewayUrl ? gatewayUrl + "/ping" : undefined),
    probe(directUrl ? directUrl + "/ping" : undefined),
    probe(gatewayUrl ? gatewayUrl + "/ping" : directUrl ? directUrl + "/ping" : undefined, { probe: 1 }),
    probe(gatewayUrl ? gatewayUrl + "/ping" : directUrl ? directUrl + "/ping" : undefined, { username: "probe-user", password: "probe-pass" }),
  ]);
  const probes = { feedback, gateway, direct, post, postPassword };
  return { kind: classifyConnection(probes), probes };
}

/** מונה אנונימי של סיווג כשל (שרת ההערות, POST /diag) — בלי שום פרט על המשתמש; כשל בשליחה מתעלמים */
export function reportDiag(kind: ConnectionKind) {
  if (!feedbackUrl) return;
  void fetch(feedbackUrl.replace(/\/$/, "") + "/diag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => {});
}

/**
 * כל כשל חיבור (שני המסלולים נכשלו) נשלח מיד לתמיכה, בלי אישור הגולש (הכרעת בעלים 8.10.2026): לוג טכני בלבד —
 * סוג הדפדפן, איזה חלק נכשל ושגיאת הדפדפן, אחרי שהוסרו אסימונים, סיסמאות וקישורים אישיים. עד 3 לכל טעינת עמוד.
 */
let autoSent = 0;
export function reportFailure(path: string, diagnostic?: Record<string, unknown>) {
  if (!feedbackUrl || autoSent >= 3) return;
  autoSent++;
  const log = JSON.stringify({ action: path.split("?")[0], code: "network", ...diagnostic }, null, 2);
  void fetch(feedbackUrl.replace(/\/$/, "") + "/autoreport", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ log }), keepalive: true }).catch(() => {});
}
