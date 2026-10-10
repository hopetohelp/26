/**
 * החוזה בין האתר לשרת ההשתתפות (worker/crowd). מקור אחד לטיפוסים בשני הצדדים — השרת מממש בדיוק את מה שכתוב כאן.
 * השיטה המלאה: docs/השתתפות-גולשים.md
 *
 * זהות (הכרעת בעלים 9.10.2026): חשבון = מייל + סיסמה, או Google. חשבון אחד לכל מייל. בלי חשבון — הכול נשמר בדפדפן בלבד ולא נכנס לסטטיסטיקות.
 * כל בקשה מזוהה נושאת `Authorization: Bearer <token>` של סשן; הסשן נשמר בדפדפן אצל הבעלים היחיד שלו — src/lib/crowdSession.ts.
 * כניסה: מייל וסיסמה או Google בלבד (10.10.2026). קישור אישי ישן (POST /auth/link ⇐ סשן) עובד רק עד שהחשבון מאומת. הוא עצמו אינו Bearer.
 *
 * POST /auth/register {email,password,name?} ⇐ {token, link}  חשבון חדש. מייל רשום ⇐ 409 email_taken.
 * POST /auth/guest   {}                    ⇐ 403 account_required (אין יותר אורח בשרת).
 * POST /auth/google  {credential,token}   ⇐ {token}       כניסה עם Google; אותו Google או אותו מייל מאומת ⇐ אותו חשבון.
 * POST /auth/claim   {email,password?}    ⇐ {email, link?}  (בסשן) הוספת מייל לחשבון ישן; סיסמה רק אם אין סיסמה ואין Google.
 * POST /account/name {name}               ⇐ {name}        שם תצוגה (מוצפן בשרת).
 * POST /account/verify/send  {}           ⇐ {sent}        (בסשן) שליחת מייל אימות לכתובת שבחשבון (Firebase); 3 בשעה.
 * POST /account/verify/check {}           ⇐ {verified}    (בסשן) בדיקה שהגולש לחץ על הקישור; כשאומת — מסומן מאומת.
 * POST /account/password {password}       ⇐ {ok}          קביעת סיסמה לחשבון בלי סיסמה (למשל Google).
 * GET|POST /ping                      ⇐ {ok}          בדיקת חיבור, בלי זהות ובלי מאגר.
 * POST /auth/login    {email|username,password} ⇐ {token}
 * POST /auth/logout   {all?:boolean}       ⇐ {ok}
 * POST /auth/password {current,next}       ⇐ {token}       קובע סיסמה (הנוכחית חובה) ומבטל את שאר הסשנים; הקישור נשאר.
 * POST /auth/link     {link}               ⇐ {token, username}  כניסה בקישור האישי ⇐ סשן רגיל. עיכוב מדורג כמו בכניסה.
 * POST /auth/recover  {link,password}      ⇐ {token, username}  שחזור: הקישור האישי + סיסמה חדשה ⇐ סשן רגיל;
 *                                                         מבטל את שאר הסשנים, הקישור נשאר. עיכוב מדורג כמו בכניסה.
 * POST /auth/forgot   {email}             ⇐ {sent}        איפוס סיסמה במייל (Firebase שולח; הקישור חוזר לאתר עם סוד חד-פעמי). אותה תשובה בין אם יש חשבון ובין אם לא; רק למייל מאומת.
 * POST /auth/reset    {secret,password}    ⇐ {token}       סיסמה חדשה עם הסוד מהמייל (30 דקות, חד-פעמי) ⇐ סשן רגיל; שאר הסשנים מבוטלים.
 * GET  /me                          ⇐ Me                  מצב המשתתף: הגרסה האחרונה בכל יחידה, שם המשתמש.
 * POST /save   SaveRequest          ⇐ {version}           גרסה חדשה ליחידה (op_id ייחודי — ניסיון חוזר מחזיר את אותה גרסה).
 *                                                       בכל יחידה נשמרת רק ההשערה האחרונה של כל יום (שעון ישראל): גרסאות קודמות מאותו יום נמחקות (הכרעת בעלים 10.10.2026).
 * GET  /history?unit=seats          ⇐ {versions: Version[]}
 * POST /history/clear {confirm:"מחק"} ⇐ {ok}          מחיקת כל הגרסאות (כל היחידות); החשבון נשאר.
 * GET  /export                      ⇐ כל נתוני המשתתף (JSON)
 * POST /delete {confirm:"מחק"}      ⇐ {ok}               מחיקה מלאה + ביטול כל הסשנים.
 * POST /link/rotate                 ⇐ 410 link_retired    אין יותר הנפקת קישורים (10.10.2026); קישור ישן מכניס עד שהחשבון מאומת, ואז נמחק.
 *
 * שחזור סיסמה: איפוס במייל (/auth/forgot ⇐ /auth/reset). המייל נשמר מוצפן.
 * GET  /dashboard                   ⇐ Dashboard            צבירה מפורסמת (ציבורי, בלי זהות).
 *      עותק שלה מתפרסם גם עם האתר עצמו (dashboard.json, כל שעה) — הסטטיסטיקות מוצגות לכולם גם בלי חיבור לשרת.
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
  /** סכום מפלגות הקואליציה, מחושב בשרת ונשמר עם הגרסה; חסר בגרסאות ישנות. */
  coalitionSeats?: number;
  personalBlocSeats?: { id: string; name: string; lists: string[]; seats: number }[];
  fixedBlocSeats?: Record<"government" | "coalition" | "opposition" | "arab" | "unity", number>;
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
  /** הרכב שנערך במפורש: לא משדרגים אותו כאילו היה ברירת מחדל ישנה. */
  schemaVersion?: 2;
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
  /** העדפות שאינן השערה (POST /prefs): המחנות במסך "מה השתנה" */
  prefs?: { camps: Record<string, string> | null; lineage?: unknown };
  /** ההשערה האחרונה חריגה וממתינה לאישור מנהל: לא נספרת בסטטיסטיקות עד אז */
  seatsPending?: boolean;
  /** המיילים של החשבון (מפוענחים בשרת רק לבעל החשבון). verified = אומת (Google) */
  emails?: { email: string | null; source: "password" | "google" | "added"; verified: boolean }[];
  /** שם תצוגה (רשות) */
  name?: string | null;
  hasPassword?: boolean;
  /** חשבון ישן בלי מייל ובלי Google — נדרש להוסיף (הכרעת בעלים 9.10.2026) */
  needsEmail?: boolean;
  /** אימות מייל זמין בשרת (מוגדר מפתח Firebase) */
  verifyAvailable?: boolean;
  /** חשבון מאומת: Google או מייל שאומת */
  verified?: boolean;
  /** חשבון ישן (קישור אישי, שם משתמש או אורח) שעוד לא אומת — נדרש לאמת מייל או לחבר Google (הכרעת בעלים 10.10.2026) */
  legacy?: boolean;
  /** חשבון מנהל (טבלת admins): נכנס לממשק הניהול בלי קישור */
  isAdmin?: boolean;
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
    /** רשימות שקיבלו לפחות ארבעה מנדטים באחת מגרסאות המשתתפים. */
    everPassedLists?: string[];
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
    fixed?: { id: string; name: string; lists: string[]; stat: SeatStat | null }[];
    explicit: { gov: SeatStat | null; rest: SeatStat | null } | null;
    customCount: number;
    /** גושים בעלי אותו הרכב רשימות, ללא תלות בשם או בסדר; אין ערבוב בין הרכבים שונים. */
    custom?: { name: string; lists: string[]; n: number; eligible?: boolean; explicit: SeatStat | null; derived: SeatStat | null }[];
  };
  vote2026?: { all: Record<string, Cell>; named: Record<string, Cell> };
  vote2022?: { all: Record<string, Cell>; valid: Record<string, Cell>; official: Record<string, number> };
  /** שורה = 2022, עמודה = 2026, אחוז מהשורה */
  matrix?: { rows: Record<string, { n: number; hidden?: boolean; cells: Record<string, Cell> }>; publishedAt: string };
  /** השערות מנדטים לפי כוונת הצבעה 2026 */
  byVote?: Record<string, { n: number; seats: Record<string, number> }>;
  trend?: { day: string; n: number; newcomers: number; changed: number; seats: Record<string, number> }[];
  underReview?: { participants: number; seats: SeatStat[] } | null;
  /** השערות חריגות שממתינות לאישור מנהל — לא נספרות (מספר בלבד) */
  pendingGuesses?: number;
  /** כמה מהנספרים מאומתים (Google או מייל שאומת) מתוך כל הנספרים. הערה קטנה בלבד: כולם נספרים בסטטיסטיקות */
  accounts?: { verified: number; total: number };
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

/** הפרסום המאוחר מבין השניים (לפי publishedAt). */
export function newerDashboard(a: Dashboard | null, b: Dashboard): Dashboard {
  return a && (a.publishedAt ?? "") > (b.publishedAt ?? "") ? a : b;
}

async function fetchDashboard(url: string): Promise<Dashboard> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
    const data = await res.json() as Dashboard;
    if (!res.ok || typeof data?.participants !== "number") throw new Error("invalid dashboard");
    return data;
  } finally { clearTimeout(timer); }
}

/** העותק שמתפרסם עם האתר (dashboard.json) — נטען מכתובת האתר עצמו, בלי שרת ההשתתפות. */
export const siteDashboard = () => fetchDashboard(`${import.meta.env.BASE_URL}dashboard.json`);

/** הנתונים העדכניים מהשרת, בשקט: בלי ממסר ובלי דיווח כשל, כי העותק שבאתר מוצג בכל מקרה. */
export async function liveDashboard(): Promise<Dashboard> {
  for (const base of BASES) {
    try { return await fetchDashboard(base + "/dashboard"); } catch { /* המסלול הבא */ }
  }
  throw new CrowdError(0, "network");
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

type CallOptions = { method?: string; body?: unknown; token?: string | null };
const REQUEST_TIMEOUT_MS = 15000;

/** רק מידע טכני: אין גוף, כותרות הרשאה, פרמטרים או כתובת אישית. */
function cleanError(value: string, opts: CallOptions): string {
  const body = opts.body && typeof opts.body === "object" ? opts.body as Record<string, unknown> : {};
  const secrets = [opts.token, ...["username", "password", "current", "next", "link", "token"].map(key => body[key])];
  const urls = value.replace(/https?:\/\/[^\s)]+/g, url => url.split(/[?#]/)[0]);
  return secrets.reduce<string>((text, secret) => typeof secret === "string" && secret ? text.split(secret).join("[הוסר]") : text, urls).slice(0, 1200);
}

function environment() {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const connection = (nav as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } } | undefined)?.connection;
  return {
    online: nav?.onLine, browser: nav?.userAgent, language: nav?.language,
    connection: connection ? { effectiveType: connection.effectiveType, downlink: connection.downlink, rtt: connection.rtt, saveData: connection.saveData } : undefined,
    origin: typeof location === "undefined" ? undefined : location.origin,
    secureContext: typeof isSecureContext === "undefined" ? undefined : isSecureContext,
    visibility: typeof document === "undefined" ? undefined : document.visibilityState,
    build: typeof document === "undefined" ? undefined : Array.from(document.scripts).map(script => script.src).find(src => /\/assets\/index-/.test(src))?.split(/[?#]/)[0],
  };
}

async function attempt(base: string, path: string, opts: CallOptions, attempts: Record<string, unknown>[], route: string, secrets = opts): Promise<Response> {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  const context = { route, at: new Date().toISOString(), endpoint: base + path.split("?")[0], method: opts.method ?? (opts.body === undefined ? "GET" : "POST") };
  try {
    const res = await fetch(base + path, {
      cache: path.split("?")[0] === "/dashboard" || route === "relay" ? "no-store" : "default",
      method: context.method, signal: ctl.signal,
      headers: { ...(opts.body === undefined ? {} : { "content-type": "application/json" }), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      // שמירות ממשיכות גם כשהדף נסגר באמצע (גוף קטן)
      keepalive: ["/save", "/prefs", "/auth/guest"].includes(path.split("?")[0]),
    });
    attempts.push({ ...context, elapsedMs: Date.now() - started, status: res.status, ok: res.ok, type: res.type, redirected: res.redirected,
      contentType: res.headers.get("content-type"), requestId: res.headers.get("cf-ray"), retryAfter: res.headers.get("retry-after") });
    return res;
  } catch (cause) {
    const diagnostic = { ...context, ...environment(), elapsedMs: Date.now() - started, timeout: ctl.signal.aborted,
      cause: cause instanceof Error ? { name: cause.name, message: cleanError(cause.message, secrets), stack: cleanError(cause.stack ?? "", secrets) } : { name: "UnknownError" } };
    attempts.push(diagnostic);
    throw new CrowdError(0, "network", diagnostic);
  } finally { clearTimeout(timer); }
}

/** אסימון אקראי שהדפדפן יוצר (32 בתים, base64url) */
export function clientToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * פעולות שאפשר להשלים "בעיוורון": אצל חלק מהגולשים (סינון ברשת) הבקשה מגיעה לשרת ונשמרת, אבל התשובה נחסמת בדרך חזרה
 * (נבדק 8.10.2026: נוצרו משתתפים בשרת בדיוק ברגעי הדיווחים על "Failed to fetch"). לכן בהרשמה ובשמירה בלי משתמש
 * הדפדפן יוצר את אסימון הסשן בעצמו ושולח אותו, וכשכל המסלולים "נכשלו" — מניחים שהבקשה נקלטה וממשיכים עם האסימון.
 */
const BLIND = new Set(["/auth/guest", "/auth/register", "/auth/google", "/save"]);
/** הפעולה האחרונה הסתיימה בלי אישור מהשרת (התשובה נחסמה) */
export let lastBlind = false;

export async function call<T>(path: string, opts: CallOptions = {}): Promise<T> {
  if (!BASES.length) throw new CrowdError(0, "offline");
  lastBlind = false;
  const p0 = path.split("?")[0];
  if ((p0 === "/auth/guest" || p0 === "/auth/register" || p0 === "/auth/google") && opts.body && typeof opts.body === "object" && !(opts.body as { token?: string }).token)
    opts = { ...opts, body: { ...(opts.body as object), token: clientToken() } };
  const started = Date.now();
  const attempts: Record<string, unknown>[] = [];
  let res: Response | undefined;
  let first: CrowdError | undefined;
  let usedRelay = false;
  for (let i = 0; i < BASES.length && !res; i++) {
    const idx = (preferred + i) % BASES.length;
    try {
      res = await attempt(BASES[idx], path, opts, attempts, BASES[idx] === gatewayUrl ? "gateway" : "direct");
      if (i > 0 && res.ok) { preferred = idx; reportDiag("fallback-saved"); }
    } catch (e) { first ??= e as CrowdError; }
  }
  if (!res) {
    usedRelay = true;
    try { res = await relay(path, opts, attempts); } catch (e) { first ??= e as CrowdError; }
    if (!res) {
      const diagnostic = { ...first?.diagnostic, ...environment(), elapsedMs: Date.now() - started, timeoutMs: REQUEST_TIMEOUT_MS, attempts };
      reportFailure(path, diagnostic);
      if (BLIND.has(p0)) {
        lastBlind = true;
        reportDiag("blind-sent");
        const body = opts.body as Record<string, unknown>;
        if (p0 === "/save") return { version: { id: 0, unit: body.unit, created_at: new Date().toISOString(), payload: body.payload }, blind: true } as T;
        return { token: body.token, blind: true } as T;
      }
      throw new CrowdError(0, "network", diagnostic);
    }
  }
  let data: unknown;
  try { data = await res.json(); } catch (cause) {
    const diagnostic = { ...environment(), elapsedMs: Date.now() - started, attempts, status: res.status, stage: "response-json", cause: { name: cause instanceof Error ? cause.name : "UnknownError" } };
    reportFailure(path, { code: "invalid_response", ...diagnostic });
    throw new CrowdError(res.status, "invalid_response", diagnostic);
  }
  if (!res.ok) {
    const code = typeof (data as { error?: unknown })?.error === "string" ? cleanError((data as { error: string }).error, opts) : "error";
    const diagnostic = { ...environment(), elapsedMs: Date.now() - started, attempts, status: res.status, method: opts.method ?? (opts.body === undefined ? "GET" : "POST"), code };
    // שגיאות זהות/קלט רגילות אינן כשל חיבור; תקלה בתשתית הממסר כן.
    if (res.status >= 500 || (usedRelay && code === "bad relay")) reportFailure(path, diagnostic);
    throw new CrowdError(res.status, code, diagnostic);
  }
  if (usedRelay) reportDiag("relay-saved");
  return data as T;
}

// ---- בדיקת חיבור: מה בדיוק נחסם? (נשלחת רק אחרי כשל, ומדווחת למונה אנונימי)
export type ConnectionKind = "all-ok" | "all-blocked" | "feedback-only" | "direct-only" | "gateway-only" | "post-blocked" | "password-blocked" | "fallback-saved" | "relay-saved" | "blind-sent";
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

/**
 * בדיקת עומק אחרי חסימה: לאילו יעדים הגולש כן מגיע. worker/crowd ב-no-cors = האם תשובה כלשהי חזרה מהשרת (גם אם סוננה);
 * site = עותק הסטטיסטיקות שבאתר; gapi = שרתי Google שקריאים לדפדפן; gsi = כפתור הכניסה של Google.
 * התוצאה נשלחת כמונים אנונימיים בלבד (probe-<יעד>-ok|fail), פעם אחת לכל טעינה.
 */
export type ProbeTarget = "worker" | "crowd" | "site" | "gapi" | "gsi";
let deepSent = false;
export async function deepProbe(): Promise<Record<ProbeTarget, boolean>> {
  const reach = async (url: string | undefined, cors: boolean) => {
    if (!url) return false;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { mode: cors ? "cors" : "no-cors", cache: "no-store", signal: ctl.signal });
      return cors ? r.ok : true;
    } catch { return false; } finally { clearTimeout(timer); }
  };
  const [worker, crowd, site, gapi, gsi] = await Promise.all([
    reach(feedbackUrl ? feedbackUrl.replace(/\/$/, "") + "/ping" : undefined, false),
    reach(directUrl ? directUrl + "/ping" : undefined, false),
    reach(`${import.meta.env.BASE_URL}dashboard.json`, true),
    reach("https://www.googleapis.com/oauth2/v3/certs", true),
    reach("https://accounts.google.com/gsi/client", false),
  ]);
  const result = { worker, crowd, site, gapi, gsi };
  if (!deepSent && feedbackUrl) {
    deepSent = true;
    for (const [k, v] of Object.entries(result)) reportProbe(`probe-${k}-${v ? "ok" : "fail"}`);
  }
  return result;
}

function reportProbe(kind: string) {
  void fetch(feedbackUrl!.replace(/\/$/, "") + "/diag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => {});
}

/**
 * ממסר: כששני המסלולים נכשלו ברשת, אותה בקשה נשלחת לשרת ההערות באותה צורה כמו דיווח הכשל — שעובר גם אצל מי שהשמירה חסומה לו
 * (הכרעת בעלים 8.10.2026). השרת מעביר אותה לשרת ההשתתפות כבקשה רגילה. כשל גם כאן ⇐ שגיאה מפורטת, והטיוטה נשארת בדפדפן.
 */
async function relay(path: string, opts: CallOptions, attempts: Record<string, unknown>[]): Promise<Response | undefined> {
  if (!feedbackUrl) { attempts.push({ route: "relay", skipped: "not-configured" }); return undefined; }
  const json = JSON.stringify({ path, method: opts.method ?? (opts.body === undefined ? "GET" : "POST"), token: opts.token ?? undefined, body: opts.body });
  // קידוד בלי פריסת מערך לארגומנטים: גם מטען גדול אינו גורם ל-RangeError.
  const d = btoa(Array.from(new TextEncoder().encode(json), byte => String.fromCharCode(byte)).join(""));
  return attempt(feedbackUrl.replace(/\/$/, ""), "/relay", { method: "POST", body: { d } }, attempts, "relay", opts);
}

/** מונה אנונימי של סיווג כשל (שרת ההערות, POST /diag) — בלי שום פרט על המשתמש; כשל בשליחה מתעלמים */
export function reportDiag(kind: ConnectionKind) {
  if (!feedbackUrl) return;
  void fetch(feedbackUrl.replace(/\/$/, "") + "/diag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => {});
}

/**
 * כל כשל חיבור סופי (כולל הממסר) נשלח לתמיכה, בלי אישור הגולש (הכרעת בעלים 8.10.2026): לוג טכני בלבד —
 * סוג הדפדפן, איזה חלק נכשל ושגיאת הדפדפן, אחרי שהוסרו אסימונים, סיסמאות וקישורים אישיים.
 * דיווח אחד לכל דפדפן בשעה (הכרעת בעלים 9.10.2026) — גולש מסונן שמרענן את העמוד אינו מציף את ההערות.
 */
const AUTO_KEY = "e26-autoreport-at";
const AUTO_GAP_MS = 60 * 60 * 1000;
let autoSentAt = 0;
function autoReportAllowed(now: number): boolean {
  let last = autoSentAt;
  try { last = Math.max(last, Number(localStorage.getItem(AUTO_KEY)) || 0); } catch { /* אין אחסון — נשען על הזיכרון של העמוד */ }
  if (now - last < AUTO_GAP_MS) return false;
  autoSentAt = now;
  try { localStorage.setItem(AUTO_KEY, String(now)); } catch { /* ראו למעלה */ }
  return true;
}
export function reportFailure(path: string, diagnostic?: Record<string, unknown>) {
  if (!feedbackUrl) return;
  // גם כשהשמירה ממשיכה "בעיוורון" ולא מוצגת שגיאה — לבדוק לאן הגולש כן מגיע (פעם אחת לטעינה).
  void deepProbe();
  if (!autoReportAllowed(Date.now())) return;
  const log = JSON.stringify({ action: path.split("?")[0], code: "network", ...diagnostic });
  void fetch(feedbackUrl.replace(/\/$/, "") + "/autoreport", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ log }), keepalive: true }).catch(() => {});
}
