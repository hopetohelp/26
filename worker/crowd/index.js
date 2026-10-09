import { personalTotals } from "./lib/blocDefinitions.js";
/**
 * שרת השתתפות הגולשים — "ההשערה שלי" ודשבורד הגולשים (Cloudflare Worker + D1 ‏elections26-crowd).
 * השיטה: docs/השתתפות-גולשים.md · החוזה (נתיבים וצורות תשובה): src/lib/crowdApi.ts — השרת מממש בדיוק אותו.
 * בלי "אני לא רובוט" (הכרעת בעלים); ההגנה: הגבלת קצב, גרסה אחרונה בלבד, זיהוי חריגות.
 * בלי עוגיות — הזהות רק בכותרת Authorization, ולכן אין חשיפה ל-CSRF.
 *
 * סודות (wrangler secret): IP_KEY; רשות: IP_KEY_PREV (24 שעות אחרי החלפה).
 * חשבון = שם משתמש + סיסמה, והוא הדרך היחידה לשמור (הכרעת בעלים 6.10.2026) — אין משתתף אנונימי.
 * בלי מייל בכלל: הקישור האישי נוצר בהרשמה; הוא מכניס (POST /auth/link ⇐ סשן) ומאפשר לקבוע סיסמה חדשה (POST /auth/recover). הוא עצמו אינו Bearer.
 * cron כל שעה: ניקוי מונים ישנים, זיהוי חריגות, צבירה ופרסום.
 */
import { randomToken, sha256, hmac, hashPassword, verifyPassword, PBKDF2_ITERATIONS } from "./lib/crypto.js";
import { bearer, authenticate, newSession, isClientToken, ipKeys, hit, waitMs, recordFail, clearFails, HOUR } from "./lib/auth.js";
import { validateSave, validateCamps, UNITS, normalizeUsername, passwordProblem } from "./lib/validate.js";
import { aggregate, HOURLY, DAILY, DASHBOARD_POLICY } from "./lib/aggregate.js";
import { detectHour, BASELINE_HOURS } from "./lib/anomaly.js";

// שמירה אוטומטית בכל שינוי (הכרעת בעלים 9.10.2026) — המכסה הוגדלה מ-20
export const LIMITS = { savesPerHour: 120, participantsPerHourPerIp: 15 };
const MAX_BODY = 16 * 1024;

function cors(env, origin) {
  const allowed = origin === env.ALLOWED_ORIGIN || /^http:\/\/localhost:\d+$/.test(origin || "");
  return {
    "access-control-allow-origin": allowed ? origin : env.ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const clock = (env) => (env.NOW ? env.NOW() : Date.now());
const iso = (t) => new Date(t).toISOString();

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const bad = (code = "bad_request", extra) => new HttpError(400, code, extra);

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "too_large");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw bad("bad_json");
  }
}

async function requireAdmin(env, request) {
  const key = request.headers.get("x-admin-key") || "";
  const ok = key.length >= 32 && (await env.DB.prepare("SELECT 1 AS x FROM admin_keys WHERE hash = ?").bind(await sha256(key)).first());
  if (!ok) throw new HttpError(401, "unauthorized");
}

async function requireAuth(env, request, now) {
  const a = await authenticate(env, bearer(request), now);
  if (!a) throw new HttpError(401, "unauthorized");
  return a;
}

/** משתתף חדש — רק מתוך הרשמה (עם הגבלה לפי IP) ⇐ [statements, participantId] */
async function createParticipant(env, request, now) {
  const [cur, ...prev] = await ipKeys(env, request);
  if (!(await hit(env, "p:" + cur, LIMITS.participantsPerHourPerIp, now, HOUR, prev.map((k) => "p:" + k)))) throw new HttpError(429, "rate");
  const id = randomToken(16);
  return [[env.DB.prepare("INSERT INTO participants (id, created_at) VALUES (?, ?)").bind(id, iso(now))], id];
}

const parseVersion = (r) => ({ id: r.id, unit: r.unit, created_at: r.created_at, payload: JSON.parse(r.payload) });

async function passwordCred(env, participant) {
  return env.DB.prepare("SELECT * FROM credentials WHERE participant = ? AND kind = 'password'").bind(participant).first();
}

async function setPassword(env, participant, password, now) {
  const h = await hashPassword(password);
  const [sess, token] = await newSession(env, participant, now);
  await env.DB.batch([
    env.DB.prepare("UPDATE credentials SET hash = ?, salt = ?, iterations = ?, algo = ? WHERE participant = ? AND kind = 'password'").bind(
      h.hash,
      h.salt,
      h.iterations,
      h.algo,
      participant,
    ),
    env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE participant = ?").bind(participant),
    sess,
  ]);
  return token;
}

function checkPassword(p) {
  const problem = passwordProblem(p);
  if (problem) throw bad("weak_password", { reason: problem });
}

/** הקישור האישי (בגוף הבקשה) ⇐ המשתתף, עם עיכוב מדורג לפי IP על ניסיונות כושלים */
async function linkOwner(env, request, now, raw) {
  const link = typeof raw === "string" && /^[\w-]{20,100}$/.test(raw) ? raw : null;
  const ips = await ipKeys(env, request);
  const keys = ["fi:" + ips[0]];
  const wait = await waitMs(env, [...keys, ...ips.slice(1).map((k) => "fi:" + k)], now);
  if (wait > 0) throw new HttpError(429, "slow_down", { retryAfter: Math.ceil(wait / 1000) });
  const c = link ? await env.DB.prepare("SELECT participant FROM credentials WHERE kind = 'link' AND token_hash = ?").bind(await sha256(link)).first() : null;
  if (!c) {
    await recordFail(env, keys, now);
    throw new HttpError(401, "bad_link");
  }
  return { participant: c.participant, keys };
}

const DUMMY = { algo: "pbkdf2-sha256", salt: "AAAAAAAAAAAAAAAAAAAAAA==", iterations: PBKDF2_ITERATIONS, hash: "0".repeat(64) };

// ---- הנתיבים
const routes = {
  // בדיקת חיבור: בלי מאגר ובלי זהות. GET ו-POST (עם גוף) — כדי שהבדיקה בדפדפן תוכל להבדיל חסימה של סוג בקשה.
  "GET /ping": async () => ({ ok: true }),
  "POST /ping": async () => ({ ok: true }),

  "GET /me": async ({ env, request, now }) => {
    const { participant } = await requireAuth(env, request, now);
    const p = await env.DB.prepare("SELECT id, created_at FROM participants WHERE id = ?").bind(participant).first();
    if (!p) throw new HttpError(401, "unauthorized");
    const { results } = await env.DB.prepare(
      "SELECT v.* FROM versions v JOIN (SELECT unit, MAX(id) AS id FROM versions WHERE participant = ? GROUP BY unit) m ON v.id = m.id",
    )
      .bind(participant)
      .all();
    const latest = Object.fromEntries((results || []).map((r) => [r.unit, parseVersion(r)]));
    const pw = await passwordCred(env, participant);
    const g = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'google'").bind(participant).first();
    const pref = await env.DB.prepare("SELECT camps FROM prefs WHERE participant = ?").bind(participant).first();
    const camps = pref?.camps ? JSON.parse(pref.camps) : null;
    return { participant: p.id, created_at: p.created_at, latest, username: pw?.username ?? null, google: !!g, guest: !pw && !g, prefs: { camps } };
  },

  // העדפות אישיות (המחנות) — נשמרות על המשתמש, בלי גרסאות ובלי השפעה על הסטטיסטיקות
  "POST /prefs": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const r = validateCamps(body.camps);
    if (!r.ok) throw bad("invalid", { field: r.error });
    if (!(await hit(env, "s:" + participant, LIMITS.savesPerHour, now))) throw new HttpError(429, "rate");
    await env.DB.prepare("INSERT INTO prefs (participant, camps, updated_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET camps = excluded.camps, updated_at = excluded.updated_at")
      .bind(participant, JSON.stringify(r.value), iso(now))
      .run();
    return { ok: true, camps: r.value };
  },

  "POST /save": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const r = validateSave(body);
    if (!r.ok) throw bad("invalid", { field: r.error });
    const { unit, op_id, registry, payload } = r.value;
    const find = () =>
      env.DB.prepare("SELECT * FROM versions WHERE participant = ? AND unit = ? AND op_id = ?").bind(participant, unit, op_id).first();
    const existing = await find();
    if (existing) return { version: parseVersion(existing) };
    if (!(await hit(env, "s:" + participant, LIMITS.savesPerHour, now))) throw new HttpError(429, "rate");
    if (unit === "blocs") {
      if (payload.mode === "custom") payload.schemaVersion = 2;
    }
    if (unit === "seats") {
      const latestBlocs = await env.DB.prepare("SELECT payload FROM versions WHERE participant = ? AND unit = 'blocs' ORDER BY id DESC LIMIT 1").bind(participant).first();
      payload.personalBlocSeats = personalTotals(payload, latestBlocs ? JSON.parse(latestBlocs.payload) : null);
    }
    await env.DB.prepare(
      "INSERT INTO versions (participant, unit, created_at, op_id, registry, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(participant, unit, op_id) DO NOTHING",
    )
      .bind(participant, unit, iso(now), op_id, registry, JSON.stringify(payload))
      .run();
    return { version: parseVersion(await find()) };
  },

  "GET /history": async ({ env, request, now, url }) => {
    const { participant } = await requireAuth(env, request, now);
    const unit = url.searchParams.get("unit");
    if (!UNITS.has(unit)) throw bad("unit");
    const { results } = await env.DB.prepare("SELECT * FROM versions WHERE participant = ? AND unit = ? ORDER BY id DESC LIMIT 500")
      .bind(participant, unit)
      .all();
    return { versions: (results || []).map(parseVersion) };
  },

  "GET /export": async ({ env, request, now }) => {
    const { participant } = await requireAuth(env, request, now);
    const p = await env.DB.prepare("SELECT id, created_at, review FROM participants WHERE id = ?").bind(participant).first();
    const versions = (await env.DB.prepare("SELECT * FROM versions WHERE participant = ? ORDER BY id").bind(participant).all()).results || [];
    const creds = (await env.DB.prepare("SELECT kind, username, created_at FROM credentials WHERE participant = ?").bind(participant).all()).results || [];
    const sessions =
      (await env.DB.prepare("SELECT created_at, expires_at, revoked FROM sessions WHERE participant = ? ORDER BY created_at").bind(participant).all())
        .results || [];
    return {
      participant: p.id,
      created_at: p.created_at,
      underReview: !!p.review,
      prefs: (await env.DB.prepare("SELECT camps, updated_at FROM prefs WHERE participant = ?").bind(participant).first()) ?? null,
      versions: versions.map((r) => ({ ...parseVersion(r), op_id: r.op_id, registry: r.registry })),
      credentials: creds,
      sessions: sessions.map((s) => ({ ...s, revoked: !!s.revoked })),
    };
  },

  "POST /delete": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    if (body.confirm !== "מחק") throw bad("confirm");
    await env.DB.batch(
      ["versions", "credentials", "sessions", "prefs"]
        .map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE participant = ?`).bind(participant))
        .concat([
          env.DB.prepare("DELETE FROM rate WHERE key = ?").bind("s:" + participant),
          env.DB.prepare("DELETE FROM participants WHERE id = ?").bind(participant),
        ]),
    );
    return { ok: true };
  },

  "POST /link/rotate": async ({ env, request, now }) => {
    const { participant } = await requireAuth(env, request, now);
    const token = randomToken();
    const th = await sha256(token);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM credentials WHERE participant = ? AND kind = 'link'").bind(participant),
      env.DB.prepare("INSERT INTO credentials (participant, kind, token_hash, created_at) VALUES (?, 'link', ?, ?)").bind(participant, th, iso(now)),
    ]);
    return { link: token };
  },

  // הרשמה = יצירת משתתף: אמצעי סיסמה + קישור אישי לשחזור + סשן. אין דרך אחרת להיווצר.
  "POST /auth/register": async ({ env, request, now, body }) => {
    const u = normalizeUsername(body.username);
    if (!u) throw bad("bad_username");
    checkPassword(body.password);
    const taken = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE username_norm = ?").bind(u.norm).first();
    if (taken) throw new HttpError(409, "username_taken");
    const [stmts, participant] = await createParticipant(env, request, now);
    const h = await hashPassword(body.password);
    const [sess, token] = await newSession(env, participant, now, isClientToken(body.token) ? body.token : undefined);
    const link = randomToken();
    try {
      await env.DB.batch([
        ...stmts,
        env.DB.prepare(
          "INSERT INTO credentials (participant, kind, username, username_norm, hash, salt, iterations, algo, created_at) VALUES (?, 'password', ?, ?, ?, ?, ?, ?, ?)",
        ).bind(participant, u.display, u.norm, h.hash, h.salt, h.iterations, h.algo, iso(now)),
        env.DB.prepare("INSERT INTO credentials (participant, kind, token_hash, created_at) VALUES (?, 'link', ?, ?)").bind(participant, await sha256(link), iso(now)),
        sess,
      ]);
    } catch {
      throw new HttpError(409, "username_taken");
    }
    return { token, link };
  },

  // שמירה בלי משתמש (הכרעת בעלים 8.10.2026): משתתף בלי סיסמה ובלי קישור אישי — אי אפשר לשחזר אותו אם הסשן אבד.
  // אותה הגבלת קצב כמו בהרשמה. בהמשך אפשר להוסיף שם משתמש וסיסמה (POST /auth/claim) ואז נוצר גם קישור אישי.
  // אסימון מהדפדפן (body.token): כשהתשובות נחסמות ברשת, הדפדפן יודע את האסימון בלי לקבל תשובה; ניסיון חוזר באותו אסימון לא יוצר משתתף נוסף.
  "POST /auth/guest": async ({ env, request, now, body }) => {
    const clientToken = isClientToken(body?.token) ? body.token : undefined;
    if (clientToken && (await authenticate(env, clientToken, now))) return { token: clientToken };
    const [stmts, participant] = await createParticipant(env, request, now);
    const [sess, token] = await newSession(env, participant, now, clientToken);
    // קישור אישי נוצר מיד (הכרעת בעלים 9.10.2026): הדרך היחידה לחזור לחשבון אורח ממכשיר אחר
    // קישור שהדפדפן הציע (כמו אסימון הסשן): ידוע לגולש גם כשתשובת השרת נחסמת בדרך ("עיוורון")
    const link = isClientToken(body?.link) ? body.link : randomToken();
    await env.DB.batch([
      ...stmts,
      env.DB.prepare("INSERT INTO credentials (participant, kind, token_hash, created_at) VALUES (?, 'link', ?, ?)").bind(participant, await sha256(link), iso(now)),
      sess,
    ]);
    return { token, link };
  },

  // הוספת שם משתמש וסיסמה למשתתף שנשמר בלי משתמש: הסשן הנוכחי נשאר, ונוצר קישור אישי לשחזור.
  "POST /auth/claim": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    if (await passwordCred(env, participant)) throw bad("has_password");
    const u = normalizeUsername(body.username);
    if (!u) throw bad("bad_username");
    checkPassword(body.password);
    const taken = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE username_norm = ?").bind(u.norm).first();
    if (taken) throw new HttpError(409, "username_taken");
    const h = await hashPassword(body.password);
    const link = randomToken();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO credentials (participant, kind, username, username_norm, hash, salt, iterations, algo, created_at) VALUES (?, 'password', ?, ?, ?, ?, ?, ?, ?)",
        ).bind(participant, u.display, u.norm, h.hash, h.salt, h.iterations, h.algo, iso(now)),
        env.DB.prepare("DELETE FROM credentials WHERE participant = ? AND kind = 'link'").bind(participant),
        env.DB.prepare("INSERT INTO credentials (participant, kind, token_hash, created_at) VALUES (?, 'link', ?, ?)").bind(participant, await sha256(link), iso(now)),
      ]);
    } catch {
      throw new HttpError(409, "username_taken");
    }
    return { username: u.display, link };
  },

  "POST /auth/login": async ({ env, request, now, body }) => {
    const u = normalizeUsername(body.username);
    const ips = await ipKeys(env, request);
    const keys = ["fi:" + ips[0], "fa:" + (await hmac(env.IP_KEY, "user|" + (u?.norm ?? String(body.username ?? ""))))];
    const wait = await waitMs(env, [...keys, ...ips.slice(1).map((k) => "fi:" + k)], now);
    if (wait > 0) throw new HttpError(429, "slow_down", { retryAfter: Math.ceil(wait / 1000) });
    const cred = u ? await env.DB.prepare("SELECT * FROM credentials WHERE kind = 'password' AND username_norm = ?").bind(u.norm).first() : null;
    const ok = await verifyPassword(String(body.password ?? ""), cred || DUMMY);
    if (!cred || !ok) {
      await recordFail(env, keys, now);
      throw new HttpError(401, "bad_credentials");
    }
    await clearFails(env, keys);
    const stmts = [];
    if (cred.iterations < PBKDF2_ITERATIONS) {
      const h = await hashPassword(body.password);
      stmts.push(env.DB.prepare("UPDATE credentials SET hash = ?, salt = ?, iterations = ?, algo = ? WHERE id = ?").bind(h.hash, h.salt, h.iterations, h.algo, cred.id));
    }
    const [sess, token] = await newSession(env, cred.participant, now);
    await env.DB.batch([...stmts, sess]);
    return { token };
  },

  "POST /auth/logout": async ({ env, request, now, body }) => {
    const a = await requireAuth(env, request, now);
    if (body.all) await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE participant = ?").bind(a.participant).run();
    else await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE token_hash = ?").bind(a.session).run();
    return { ok: true };
  },

  // שינוי סיסמה בסשן רגיל — חובה הסיסמה הנוכחית. כל הסשנים האחרים מבוטלים; הקישור האישי נשאר.
  "POST /auth/password": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const cred = await passwordCred(env, participant);
    if (!cred) throw bad("no_password");
    const keys = ["fa:" + (await hmac(env.IP_KEY, "user|" + cred.username_norm))];
    const wait = await waitMs(env, keys, now);
    if (wait > 0) throw new HttpError(429, "slow_down", { retryAfter: Math.ceil(wait / 1000) });
    if (!(await verifyPassword(String(body.current ?? ""), cred))) {
      await recordFail(env, keys, now);
      throw new HttpError(401, "bad_credentials");
    }
    checkPassword(body.next);
    return { token: await setPassword(env, participant, body.next, now) };
  },

  // כניסה בקישור האישי ⇐ סשן רגיל (בלי סיסמה). הקישור עצמו אינו Bearer לשום נתיב. עיכוב מדורג כמו בכניסה.
  "POST /auth/link": async ({ env, request, now, body }) => {
    const { participant, keys } = await linkOwner(env, request, now, body.link);
    await clearFails(env, keys);
    const [sess, token] = await newSession(env, participant, now);
    await sess.run();
    const cred = await passwordCred(env, participant);
    return { token, username: cred?.username ?? null };
  },

  // שחזור: הקישור האישי + סיסמה חדשה ⇐ סשן רגיל; שאר הסשנים מבוטלים, הקישור נשאר.
  "POST /auth/recover": async ({ env, request, now, body }) => {
    const { participant, keys } = await linkOwner(env, request, now, body.link);
    const cred = await passwordCred(env, participant);
    if (!cred) throw bad("no_password");
    checkPassword(body.password);
    await clearFails(env, keys);
    return { token: await setPassword(env, participant, body.password, now), username: cred.username };
  },

  // ---- ממשק ניהול (דרך שרת ההערות בלבד): שיחות תמיכה של משתתפים מאומתים ומספרים כלליים. מפתח בכותרת x-admin-key.
  "GET /admin/support": async ({ env, request }) => {
    await requireAdmin(env, request);
    const { results: threads } = await env.DB.prepare("SELECT participant, created_at, updated_at, status FROM support_threads ORDER BY updated_at DESC").all();
    const { results: msgs } = await env.DB.prepare("SELECT id, participant, author, text, created_at FROM support_messages ORDER BY id").all();
    const stats = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM participants) AS participants, (SELECT COUNT(*) FROM participants WHERE created_at >= date('now')) AS participantsToday, (SELECT COUNT(DISTINCT participant) FROM versions) AS savers, (SELECT COUNT(DISTINCT participant) FROM versions WHERE created_at >= date('now')) AS saversToday, (SELECT COUNT(*) FROM versions WHERE created_at >= date('now')) AS savesToday, (SELECT COUNT(*) FROM participants p WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.participant = p.id) AND EXISTS (SELECT 1 FROM credentials c WHERE c.participant = p.id AND c.kind = 'password')) AS accountsNoSave, (SELECT COUNT(*) FROM participants p WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.participant = p.id) AND NOT EXISTS (SELECT 1 FROM credentials c WHERE c.participant = p.id)) AS emptyGuests").first();
    return { stats, threads: (threads || []).map((t) => ({ ...t, messages: (msgs || []).filter((m) => m.participant === t.participant).map(({ participant: _p, ...m }) => m) })) };
  },
  // קריאה בלבד לצורך העברה לשרת ההערות; רק בעל הסשן מקבל את ההיסטוריה שלו.
  "GET /support/access": async ({ env, request, now }) => {
    const { participant } = await requireAuth(env, request, now);
    const thread = await env.DB.prepare("SELECT status, created_at, updated_at FROM support_threads WHERE participant = ?").bind(participant).first();
    const { results } = await env.DB.prepare("SELECT id, author, text, created_at FROM support_messages WHERE participant = ? ORDER BY id").bind(participant).all();
    return { participant, thread: thread ? { ...thread, messages: results || [] } : null };
  },

  "GET /log": async ({ env }) => {
    const { results } = await env.DB.prepare("SELECT * FROM review_log ORDER BY id DESC LIMIT 500").all();
    return {
      entries: (results || []).map((r) => ({
        at: r.at,
        rule: r.rule,
        segment: r.segment,
        participants: r.participants,
        reason: r.reason,
        decision: r.decision,
        aggregationId: r.aggregation_id,
      })),
    };
  },
};

// הסטטיסטיקות מחושבות כל הזמן: כל פתיחה מקבלת תמונה עדכנית. תוצאה אחת משרתת את כל הפניות בחצי הדקה
// שאחריה (בכל עותק של השרת), כדי שרענון אוטומטי אצל גולשים רבים לא יקרא את כל המאגר בכל פעם. שמירה חדשה מבטלת אותה.
const DASHBOARD_TTL_MS = 30_000;
let dashboardCache = null;
export function resetDashboardCache() { dashboardCache = null; }

async function dashboard(env) {
  const at = clock(env);
  if (dashboardCache && at >= dashboardCache.at && at - dashboardCache.at < DASHBOARD_TTL_MS) return dashboardCache.data;
  const data = await computeDashboard(env);
  dashboardCache = { at, data };
  return data;
}

async function computeDashboard(env) {
  // תמונה עדכנית, בלי כתיבה ובלי להמתין למשימה השעתית.
  // התשובות האישיות נשארות בשרת; רק התוצאה המצטברת יוצאת לדפדפן.
  const now = iso(clock(env));
  const data = await env.DB.batch([
    env.DB.prepare("SELECT id, review FROM participants"),
    env.DB.prepare("SELECT id, participant, unit, created_at, payload FROM versions ORDER BY id"),
    env.DB.prepare("SELECT composition, name FROM bloc_display_names WHERE status = 'approved'"),
  ]);
  const participants = data[0].results || [];
  const versions = (data[1].results || []).map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  const blocNames = Object.fromEntries((data[2].results || []).map(r => [r.composition, r.name]));
  return aggregate({ participants, versions, now, blocNames, aggregationId: `live-${now}` }).dashboard;
}

// ---- המשימה השעתית
const hourOf = (t) => iso(Math.floor(t / HOUR) * HOUR).slice(0, 13);

/** זיהוי חריגות לכל שעה שלמה שטרם נבדקה (עד 48 אחורה) */
export async function runAnomaly(env, now, aggregationId) {
  const last = await env.DB.prepare("SELECT hour FROM hours ORDER BY hour DESC LIMIT 1").first();
  const curStart = Math.floor(now / HOUR) * HOUR;
  let t = last ? Date.parse(last.hour + ":00:00Z") + HOUR : curStart - HOUR;
  t = Math.max(t, curStart - 48 * HOUR);
  for (; t < curStart; t += HOUR) {
    const hour = hourOf(t);
    const { results: news } = await env.DB.prepare(
      `SELECT p.id, (SELECT payload FROM versions v WHERE v.participant = p.id AND v.unit = 'seats' ORDER BY v.id DESC LIMIT 1) AS seats
       FROM participants p WHERE p.created_at >= ? AND p.created_at < ?`,
    )
      .bind(iso(t), iso(t + HOUR))
      .all();
    const { results: hist } = await env.DB.prepare(
      `SELECT newcomers FROM hours WHERE hour >= ? AND hour < ? AND (flagged = 0 OR hour IN (SELECT hour FROM review_log WHERE decision = 'restored')) ORDER BY hour`,
    )
      .bind(hourOf(t - BASELINE_HOURS * HOUR), hour)
      .all();
    const newcomers = (news || []).map((r) => ({ id: r.id, seats: r.seats ? JSON.parse(r.seats) : null }));
    const d = detectHour(newcomers, (hist || []).map((h) => h.newcomers));
    const stmts = [env.DB.prepare("INSERT OR REPLACE INTO hours (hour, newcomers, flagged) VALUES (?, ?, ?)").bind(hour, newcomers.length, d.flagged ? 1 : 0)];
    if (d.flagged) {
      stmts.push(env.DB.prepare("UPDATE participants SET review = 1 WHERE created_at >= ? AND created_at < ?").bind(iso(t), iso(t + HOUR)));
      stmts.push(
        env.DB.prepare("INSERT INTO review_log (at, hour, rule, segment, participants, reason, decision, aggregation_id) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)").bind(
          iso(now),
          hour,
          d.rule,
          `משתתפים חדשים ${hour}:00 UTC`,
          newcomers.length,
          d.reason,
          aggregationId,
        ),
      );
    }
    await env.DB.batch(stmts);
  }
}

export async function runAggregation(env, now) {
  const aggregationId = "agg-" + hourOf(now);
  await runAnomaly(env, now, aggregationId);
  const participants = (await env.DB.prepare("SELECT id, review FROM participants").all()).results || [];
  const versions = ((await env.DB.prepare("SELECT id, participant, unit, created_at, payload FROM versions ORDER BY id").all()).results || []).map((r) => ({
    ...r,
    payload: JSON.parse(r.payload),
  }));
  const previous = {};
  for (const name of [...HOURLY, ...DAILY]) {
    const r = await env.DB.prepare("SELECT * FROM aggregates WHERE section = ? ORDER BY id DESC LIMIT 1").bind(name).first();
    if (r) previous[name] = { json: r.json === null ? null : JSON.parse(r.json), publishedAt: r.published_at, contributors: r.contributors, snapshot: JSON.parse(r.snapshot || "[]") };
  }
  const dailyRow = await env.DB.prepare("SELECT json FROM aggregates WHERE section = 'daily' ORDER BY id DESC LIMIT 1").first();
  const lastDash = await env.DB.prepare("SELECT json FROM aggregates WHERE section = 'dashboard' ORDER BY id DESC LIMIT 1").first();
  const previousDash = lastDash ? JSON.parse(lastDash.json) : null;
  const wasOpen = !!previousDash?.open && previousDash.policy === DASHBOARD_POLICY;
  const names = (await env.DB.prepare("SELECT composition, name FROM bloc_display_names WHERE status = 'approved'").all()).results || [];
  const blocNames = Object.fromEntries(names.map(r => [r.composition,r.name]));
  const res = aggregate({ blocNames, wasOpen, participants, versions, now: iso(now), previous, lastDailyDay: dailyRow ? JSON.parse(dailyRow.json).day : null, aggregationId });
  const ins = (section, json, publishedAt, contributors = 0, snapshot = null) =>
    env.DB.prepare("INSERT INTO aggregates (aggregation_id, published_at, section, json, contributors, snapshot) VALUES (?, ?, ?, ?, ?, ?)").bind(
      aggregationId,
      publishedAt,
      section,
      json === null || json === undefined ? null : JSON.stringify(json),
      contributors,
      snapshot ? JSON.stringify(snapshot) : null,
    );
  const stmts = [];
  for (const [name, s] of Object.entries(res.sections)) if (!s.kept) stmts.push(ins(name, s.json, s.publishedAt, s.contributors, s.snapshot));
  if (res.daily) stmts.push(ins("daily", { day: res.today }, iso(now)));
  stmts.push(ins("dashboard", res.dashboard, iso(now), res.dashboard.participants));
  // פרסום אטומי: כל החלקים והקובץ המלא באותה טרנזקציה
  await env.DB.batch(stmts);
  return res;
}

export async function cleanup(env, now) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rate WHERE window_start < ?").bind(now - 24 * HOUR),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked = 1").bind(iso(now - 24 * HOUR)),
    env.DB.prepare("DELETE FROM aggregates WHERE section = 'dashboard' AND published_at < ?").bind(iso(now - 7 * 24 * HOUR)),
  ]);
}

export default {
  async fetch(request, env) {
    const headers = { ...cors(env, request.headers.get("origin")), "content-type": "application/json; charset=utf-8" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    const now = clock(env);
    try {
      // תאימות לביקורים שכבר פתוחים: כל כתיבת תמיכה עוברת לשרת ההערות.
      if (url.pathname === "/support" || url.pathname === "/admin/support/reply") {
        if (!env.FEEDBACK) throw new HttpError(503, "support_offline");
        const admin = url.pathname === "/admin/support/reply";
        if (admin) await requireAdmin(env, request);
        const body = request.method === "POST" ? await readJson(request) : {};
        const target = admin ? "/admin/reply" : "/support";
        const payload = admin ? { kind: "support", id: body.participant, text: body.text } : { ...body, ...(body.text !== undefined ? { op_id: body.op_id || randomToken(16) } : {}), token: bearer(request) };
        return env.FEEDBACK.fetch(new Request("https://feedback.internal" + target, {
          method: "POST", headers: { "content-type": "application/json", origin: request.headers.get("origin") || "", "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "", ...(admin ? { authorization: `Bearer ${request.headers.get("x-admin-key")}` } : {}) }, body: JSON.stringify(payload),
        }));
      }
      if (request.method === "GET" && url.pathname === "/dashboard")
        return new Response(JSON.stringify(await dashboard(env)), { headers: { ...headers, "cache-control": "no-store" } });
      const handler = routes[`${request.method} ${url.pathname}`];
      if (!handler) throw new HttpError(404, "not_found");
      const body = request.method === "POST" ? await readJson(request) : {};
      if (body === null || typeof body !== "object" || Array.isArray(body)) throw bad("bad_json");
      const out = await handler({ env, request, url, now, body });
      if (request.method === "POST") resetDashboardCache();
      return new Response(JSON.stringify(out), { headers: { ...headers, "cache-control": "no-store" } });
    } catch (e) {
      if (e instanceof HttpError) {
        const h = { ...headers };
        if (e.extra?.retryAfter) h["retry-after"] = String(e.extra.retryAfter);
        return new Response(JSON.stringify({ error: e.code, ...e.extra }), { status: e.status, headers: h });
      }
      console.error(e);
      return new Response(JSON.stringify({ error: "server" }), { status: 500, headers });
    }
  },

  async scheduled(event, env, ctx) {
    resetDashboardCache();
    const now = clock(env);
    const job = (async () => {
      await cleanup(env, now);
      await runAggregation(env, now);
    })();
    if (ctx?.waitUntil) ctx.waitUntil(job);
    await job;
  },
};
