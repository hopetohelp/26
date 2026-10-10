import { personalTotals, migrateBlocs } from "./lib/blocDefinitions.js";
/**
 * שרת השתתפות הגולשים — "ההשערה שלי" ודשבורד הגולשים (Cloudflare Worker + D1 ‏elections26-crowd).
 * השיטה: docs/השתתפות-גולשים.md · החוזה (נתיבים וצורות תשובה): src/lib/crowdApi.ts — השרת מממש בדיוק אותו.
 * בלי "אני לא רובוט" (הכרעת בעלים); ההגנה: הגבלת קצב, גרסה אחרונה בלבד, זיהוי חריגות.
 * בלי עוגיות — הזהות רק בכותרת Authorization, ולכן אין חשיפה ל-CSRF.
 *
 * סודות (wrangler secret): IP_KEY; רשות: IP_KEY_PREV (24 שעות אחרי החלפה).
 * חשבון = שם משתמש + סיסמה, והוא הדרך היחידה לשמור (הכרעת בעלים 6.10.2026) — אין משתתף אנונימי.
 * שחזור גישה: הקישור האישי נוצר בהרשמה; הוא מכניס (POST /auth/link ⇐ סשן) ומאפשר לקבוע סיסמה חדשה (POST /auth/recover); הוא עצמו אינו Bearer.
 * ובנוסף איפוס במייל (POST /auth/forgot ו-/auth/reset, 10.10.2026) למי שהמייל שלו מאומת.
 * cron כל שעה: ניקוי מונים ישנים, זיהוי חריגות, צבירה ופרסום.
 */
import { randomToken, sha256, hmac, hashPassword, verifyPassword, PBKDF2_ITERATIONS } from "./lib/crypto.js";
import { verifyGoogle } from "./lib/google.js";
import { bearer, authenticate, newSession, isClientToken, ipKeys, hit, waitMs, recordFail, clearFails, HOUR } from "./lib/auth.js";
import { validateSave, validateCamps, validateLineage, UNITS, normalizeUsername, passwordProblem } from "./lib/validate.js";
import { aggregate, HOURLY, DAILY, DASHBOARD_POLICY } from "./lib/aggregate.js";
import { detectHour, BASELINE_HOURS } from "./lib/anomaly.js";
import { moderate } from "./lib/moderation.js";
import { normalizeEmail, normalizeName, emailHash, seal, open } from "./lib/identity.js";
import * as fb from "./lib/firebase.js";
import { LISTS_2026 } from "./lib/lists.js";

const IDS_2026_LIST = LISTS_2026.map((l) => l.id);

// שמירה אוטומטית בכל שינוי (הכרעת בעלים 9.10.2026) — המכסה הוגדלה מ-20
export const LIMITS = { savesPerHour: 120, participantsPerHourPerIp: 15 };
const MAX_BODY = 16 * 1024;
const RESET_TTL = 30 * 60 * 1000;

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

/** היום לפי שעון ישראל (YYYY-MM-DD) — גבול "ההשערה האחרונה של היום" */
const IL_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });
const ilDay = (t) => IL_DAY.format(new Date(t));
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

/** מנהל = מפתח ניהול (גיבוב ב-admin_keys), או סשן של חשבון שהוגדר מנהל (טבלת admins; הכרעת בעלים 9.10.2026) */
async function requireAdmin(env, request) {
  const key = request.headers.get("x-admin-key") || "";
  if (key.length < 32) throw new HttpError(401, "unauthorized");
  if (await env.DB.prepare("SELECT 1 AS x FROM admin_keys WHERE hash = ?").bind(await sha256(key)).first()) return;
  const session = /^[\w-]{32,100}$/.test(key) ? await authenticate(env, key, clock(env)) : null;
  if (session && (await env.DB.prepare("SELECT 1 AS x FROM admins WHERE participant = ?").bind(session.participant).first())) return;
  throw new HttpError(401, "unauthorized");
}

async function requireAuth(env, request, now) {
  const a = await authenticate(env, bearer(request), now);
  if (!a) throw new HttpError(401, "unauthorized");
  return a;
}

/** הגבלת יצירת משתתפים לפי IP. בהרשמה — לפני בדיקת "השם תפוס", כדי שאי אפשר יהיה לבדוק בלי הגבלה אם מייל או שם רשומים באתר */
async function limitNewParticipant(env, request, now) {
  const [cur, ...prev] = await ipKeys(env, request);
  if (!(await hit(env, "p:" + cur, LIMITS.participantsPerHourPerIp, now, HOUR, prev.map((k) => "p:" + k)))) throw new HttpError(429, "rate");
}

/** משתתף חדש — רק מתוך הרשמה (עם הגבלה לפי IP; limited = ההגבלה כבר נבדקה) ⇐ [statements, participantId] */
async function createParticipant(env, request, now, limited = false) {
  if (!limited) await limitNewParticipant(env, request, now);
  const id = randomToken(16);
  return [[env.DB.prepare("INSERT INTO participants (id, created_at) VALUES (?, ?)").bind(id, iso(now))], id];
}

/** החלטות המנהל על השערות חריגות ⇐ Map(versionId ⇐ decision) */
async function loadDecisions(env) {
  const { results } = await env.DB.prepare("SELECT version_id, decision FROM version_review").all();
  return new Map((results || []).map((r) => [r.version_id, r.decision]));
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

/**
 * המשתתפים עם הדגלים לצבירה: review (שעה חשודה), google (יש חשבון Google), verified (Google או מייל מאומת — הכרעת בעלים 9.10.2026:
 * רק מאומתים נספרים בסטטיסטיקות; השאר באזור נפרד).
 */
const PARTICIPANTS_SQL =
  "SELECT p.id, p.review, EXISTS(SELECT 1 FROM credentials c WHERE c.participant = p.id AND c.kind = 'google') AS google, (EXISTS(SELECT 1 FROM credentials c WHERE c.participant = p.id AND c.kind = 'google') OR EXISTS(SELECT 1 FROM emails e WHERE e.participant = p.id AND e.verified = 1)) AS verified FROM participants p";

/**
 * הגושים של השערה, לממשק הניהול (הכרעת בעלים 9.10.2026): הגושים שהמשתתף הגדיר (או ברירת המחדל כשלא שמר הגדרה),
 * עם סכום המנדטים של כל גוש לפי ההשערה, והיעד אם קבע. בלי מזהה.
 */
function blocsOf(seatsPayload, definition) {
  const defined = definition ? (definition.mode === "gov37" ? definition.blocs : migrateBlocs(definition).blocs) : [];
  const targets = new Map(defined.map((b) => [b.id, b.target ?? null]));
  const items = personalTotals(seatsPayload, definition).map((b) => ({ name: b.name, lists: b.lists, seats: b.seats, target: targets.get(b.id) ?? null }));
  return { saved: !!definition, items };
}

/** מצב הבדיקה של ההשערות: הגרסה האחרונה (מנדטים) של כל משתתף, ותוצאת הבדיקה מול שאר הגולשים */
async function moderationState(env) {
  const data = await env.DB.batch([
    env.DB.prepare(PARTICIPANTS_SQL),
    env.DB.prepare("SELECT v.id, v.participant, v.unit, v.created_at, v.payload FROM versions v JOIN (SELECT participant, MAX(id) AS id FROM versions WHERE unit = 'seats' GROUP BY participant) m ON v.id = m.id"),
    env.DB.prepare("SELECT version_id, decision FROM version_review"),
    env.DB.prepare("SELECT v.participant, v.payload FROM versions v JOIN (SELECT participant, MAX(id) AS id FROM versions WHERE unit = 'blocs' GROUP BY participant) m ON v.id = m.id"),
  ]);
  const blocsBy = new Map((data[3].results || []).map((r) => [r.participant, JSON.parse(r.payload)]));
  const review = new Set((data[0].results || []).filter((p) => p.review).map((p) => p.id));
  const known = new Set((data[0].results || []).map((p) => p.id));
  const verified = new Set((data[0].results || []).filter((p) => p.verified).map((p) => p.id));
  const latest = (data[1].results || []).filter((r) => known.has(r.participant)).map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  const decisions = new Map((data[2].results || []).map((r) => [r.version_id, r.decision]));
  // הבדיקה מול כל המשתתפים שנספרים (לא "בבדיקה"); מאומתים ולא מאומתים נספרים באותה צורה
  const counted = latest.filter((v) => !review.has(v.participant));
  const mod = moderate(counted, decisions);
  // הסיבות לחריגה גם להשערות שכבר הוכרעו (לתצוגה בלבד)
  const raw = moderate(counted, new Map()).pending;
  return { latest, review, verified, blocsBy, mod: { ...mod, decisions, raw } };
}

/** המייל כבר רשום — בגיבוב, או כשם משתמש ישן (גלוי) של חשבון שנרשם לפני 9.10.2026 */
async function emailTaken(env, eh, email) {
  if (await env.DB.prepare("SELECT 1 AS x FROM emails WHERE hash = ?").bind(eh).first()) return true;
  return !!(await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE username_norm = ?").bind(email.display).first());
}

const emailRow = async (env, participant, eh, display, source, verified, now) =>
  env.DB.prepare("INSERT INTO emails (hash, participant, enc, source, verified, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(eh, participant, await seal(env, display), source, verified, iso(now));

const nameRow = async (env, participant, name, now) =>
  env.DB.prepare("INSERT INTO profile (participant, name_enc, updated_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET name_enc = excluded.name_enc, updated_at = excluded.updated_at").bind(participant, await seal(env, name), iso(now));

/** שם משתמש ישן שהוא מייל (גלוי במאגר) ⇐ מייל מוצפן + גיבוב, והשם הגלוי נמחק */
async function migrateLegacyEmail(env, cred, now) {
  const email = normalizeEmail(cred.username);
  if (!email) return [];
  const eh = await emailHash(env, email.norm);
  const taken = await env.DB.prepare("SELECT participant FROM emails WHERE hash = ?").bind(eh).first();
  return [
    ...(taken ? [] : [await emailRow(env, cred.participant, eh, email.display, "password", 0, now)]),
    env.DB.prepare("UPDATE credentials SET username = NULL, username_norm = NULL WHERE id = ?").bind(cred.id),
  ];
}

/**
 * חשבון מאומת (Google או מייל שאומת) — הקישור האישי ושם המשתמש הישן נמחקים (הכרעת בעלים 10.10.2026: כניסה רק במייל וסיסמה או Google).
 * שם משתמש ישן נשמר כשם תצוגה (מוצפן), כמו השם של כל חשבון חדש, אם עוד אין שם.
 */
async function retireLegacy(env, participant, now) {
  const verified = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'google' UNION SELECT 1 AS x FROM emails WHERE participant = ? AND verified = 1").bind(participant, participant).first();
  if (!verified) return;
  const stmts = [];
  if (await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'link'").bind(participant).first()) {
    stmts.push(env.DB.prepare("DELETE FROM credentials WHERE participant = ? AND kind = 'link'").bind(participant));
  }
  const pw = await passwordCred(env, participant);
  if (pw?.username) {
    const hasName = await env.DB.prepare("SELECT 1 AS x FROM profile WHERE participant = ? AND name_enc IS NOT NULL").bind(participant).first();
    const name = pw.username.includes("@") ? null : normalizeName(pw.username);
    if (!hasName && name) stmts.push(await nameRow(env, participant, name, now));
    stmts.push(env.DB.prepare("UPDATE credentials SET username = NULL, username_norm = NULL WHERE id = ?").bind(pw.id));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

async function firstEmail(env, participant) {
  const r = await env.DB.prepare("SELECT enc FROM emails WHERE participant = ? ORDER BY created_at LIMIT 1").bind(participant).first();
  return r ? await open(env, r.enc) : null;
}

/** המשתמש הזמני ב-Firebase של חשבון ⇐ idToken, או null אם אין/נמחק שם */
async function firebaseSession(env, participant, email) {
  const rec = await env.DB.prepare("SELECT fb_enc FROM email_verify WHERE participant = ?").bind(participant).first();
  if (!rec) return null;
  const pw = await open(env, rec.fb_enc);
  if (!pw) return null;
  try {
    return await fb.signIn(env, email, pw);
  } catch {
    return null;
  }
}

/** מחיקה בשיטת best effort של המשתמש הזמני ב-Firebase (אחרי אימות, או במחיקת חשבון) */
async function dropFirebaseUser(env, participant) {
  try {
    const row = await env.DB.prepare("SELECT enc FROM emails WHERE participant = ? ORDER BY created_at LIMIT 1").bind(participant).first();
    const email = row ? await open(env, row.enc) : null;
    const token = email ? await firebaseSession(env, participant, email) : null;
    if (token) await fb.removeUser(env, token);
  } catch { /* Firebase לא זמין — המשתמש הזמני נשאר שם, בלי נתונים שלנו */ }
}

const fbFailure = (e) => {
  if (!(e instanceof fb.FirebaseError)) return e;
  if (e.code === "OPERATION_NOT_ALLOWED" || e.code === "NOT_CONFIGURED") return new HttpError(503, "verify_not_enabled");
  if (e.code === "TOO_MANY_ATTEMPTS_TRY_LATER" || e.code === "QUOTA_EXCEEDED") return new HttpError(429, "slow_down");
  if (e.code === "EMAIL_EXISTS") return new HttpError(409, "verify_unavailable");
  return new HttpError(502, "verify_failed");
};

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
    let pw = await passwordCred(env, participant);
    if (env.DATA_KEY && pw?.username?.includes("@")) {
      await env.DB.batch(await migrateLegacyEmail(env, pw, now));
      pw = await passwordCred(env, participant);
    }
    await retireLegacy(env, participant, now);
    pw = await passwordCred(env, participant);
    const g = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'google'").bind(participant).first();
    const hasLink = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'link'").bind(participant).first();
    const emailRows = (await env.DB.prepare("SELECT enc, source, verified FROM emails WHERE participant = ? ORDER BY created_at").bind(participant).all()).results || [];
    const emails = [];
    for (const r of emailRows) emails.push({ email: await open(env, r.enc), source: r.source, verified: !!r.verified });
    const prof = await env.DB.prepare("SELECT name_enc FROM profile WHERE participant = ?").bind(participant).first();
    const pref = await env.DB.prepare("SELECT camps FROM prefs WHERE participant = ?").bind(participant).first();
    const camps = pref?.camps ? JSON.parse(pref.camps) : null;
    const lin = await env.DB.prepare("SELECT lineage FROM lineage_prefs WHERE participant = ?").bind(participant).first();
    const lineage = lin?.lineage ? JSON.parse(lin.lineage) : null;
    // ההשערה האחרונה ממתינה לאישור מנהל (חריגה) — הגולש רואה אותה כרגיל, עם הסבר
    const seatsPending = latest.seats ? (await dashboardState(env)).pending.has(latest.seats.id) : false;
    return {
      participant: p.id, created_at: p.created_at, latest, username: pw?.username ?? null, google: !!g, guest: !pw && !g, prefs: { camps, lineage }, seatsPending,
      emails, name: prof ? await open(env, prof.name_enc) : null, hasPassword: !!pw,
      // חשבון בלי מייל ובלי Google (אורח או שם משתמש ישן) — נדרש להוסיף בכניסה הבאה (הכרעת בעלים 9.10.2026)
      needsEmail: !emails.length && !g,
      // אימות מייל במייל: זמין כשמוגדר מפתח Firebase
      verifyAvailable: !!env.FIREBASE_API_KEY,
      isAdmin: !!(await env.DB.prepare("SELECT 1 AS x FROM admins WHERE participant = ?").bind(participant).first()),
      // נספר בסטטיסטיקות רק חשבון מאומת: Google או מייל שאומת
      verified: !!g || emailRows.some((r) => r.verified),
      // חשבון ישן (קישור אישי, שם משתמש או אורח) שעוד לא אומת — נדרש לאמת מייל או לחבר Google מיד בכניסה (הכרעת בעלים 10.10.2026)
      legacy: !!hasLink || !!pw?.username || (!pw && !g),
    };
  },

  // העדפות אישיות (המחנות) — נשמרות על המשתמש, בלי גרסאות ובלי השפעה על הסטטיסטיקות
  "POST /prefs": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    // camps (המחנות, הגרסה הקודמת) ו/או lineage (השיוך האישי) — לפחות אחד
    if (body.camps === undefined && body.lineage === undefined) throw bad("invalid", { field: "prefs" });
    const c = body.camps === undefined ? null : validateCamps(body.camps);
    if (c && !c.ok) throw bad("invalid", { field: c.error });
    const l = body.lineage === undefined ? null : validateLineage(body.lineage);
    if (l && !l.ok) throw bad("invalid", { field: l.error });
    if (!(await hit(env, "s:" + participant, LIMITS.savesPerHour, now))) throw new HttpError(429, "rate");
    if (c) await env.DB.prepare("INSERT INTO prefs (participant, camps, updated_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET camps = excluded.camps, updated_at = excluded.updated_at")
      .bind(participant, JSON.stringify(c.value), iso(now))
      .run();
    if (l) await env.DB.prepare("INSERT INTO lineage_prefs (participant, lineage, updated_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET lineage = excluded.lineage, updated_at = excluded.updated_at")
      .bind(participant, JSON.stringify(l.value), iso(now))
      .run();
    return { ok: true, ...(c ? { camps: c.value } : {}), ...(l ? { lineage: l.value } : {}) };
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
    const saved = await find();
    // כלל קבוע (הכרעת בעלים 10.10.2026): בכל יחידה נשמרת ההשערה האחרונה של כל יום (שעון ישראל); גרסאות קודמות מאותו יום נמחקות.
    // "מצב בסוף יום" (מגמות) אינו משתנה, כי האחרונה היא מצב סוף היום.
    const { results: earlier } = await env.DB.prepare("SELECT id, created_at FROM versions WHERE participant = ? AND unit = ? AND id < ?").bind(participant, unit, saved.id).all();
    const sameDay = (earlier || []).filter((v) => ilDay(v.created_at) === ilDay(saved.created_at)).map((v) => v.id);
    if (sameDay.length) {
      const marks = sameDay.map(() => "?").join(",");
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM version_review WHERE version_id IN (${marks})`).bind(...sameDay),
        env.DB.prepare(`DELETE FROM bloc_migration_backup WHERE kind = 'version' AND id IN (${marks})`).bind(...sameDay),
        env.DB.prepare(`DELETE FROM versions WHERE id IN (${marks})`).bind(...sameDay),
      ]);
    }
    return { version: parseVersion(saved) };
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

  // "מחק הכל" בלשונית ההשערות שלי: כל הגרסאות של המשתתף נמחקות; החשבון נשאר
  "POST /history/clear": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    if (body.confirm !== "מחק") throw bad("confirm");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM version_review WHERE version_id IN (SELECT id FROM versions WHERE participant = ?)").bind(participant),
      env.DB.prepare("DELETE FROM bloc_migration_backup WHERE kind = 'version' AND id IN (SELECT id FROM versions WHERE participant = ?)").bind(participant),
      env.DB.prepare("DELETE FROM versions WHERE participant = ?").bind(participant),
    ]);
    return { ok: true };
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
      lineage: (await env.DB.prepare("SELECT lineage, updated_at FROM lineage_prefs WHERE participant = ?").bind(participant).first()) ?? null,
      versions: versions.map((r) => ({ ...parseVersion(r), op_id: r.op_id, registry: r.registry })),
      credentials: creds,
      sessions: sessions.map((s) => ({ ...s, revoked: !!s.revoked })),
    };
  },

  "POST /delete": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    if (body.confirm !== "מחק") throw bad("confirm");
    // שיחת התמיכה נשמרת בשרת ההערות — נמחקת שם קודם, כל עוד הסשן עדיין תקף (השרת שם מאמת אותו מולנו)
    if (env.FEEDBACK) {
      try {
        await env.FEEDBACK.fetch(new Request("https://feedback.internal/support/purge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: bearer(request) }) }));
      } catch { /* שרת ההערות לא זמין — המחיקה כאן ממשיכה */ }
    }
    await dropFirebaseUser(env, participant);
    await env.DB.batch(
      [
        env.DB.prepare("DELETE FROM version_review WHERE version_id IN (SELECT id FROM versions WHERE participant = ?)").bind(participant),
        env.DB.prepare("DELETE FROM bloc_migration_backup WHERE kind = 'version' AND id IN (SELECT id FROM versions WHERE participant = ?)").bind(participant),
      ]
        .concat(
          ["versions", "credentials", "sessions", "prefs", "lineage_prefs", "emails", "profile", "email_verify", "password_reset", "password_reset_email", "admins", "support_messages", "support_threads"].map((t) =>
            env.DB.prepare(`DELETE FROM ${t} WHERE participant = ?`).bind(participant),
          ),
        )
        .concat([
          env.DB.prepare("DELETE FROM rate WHERE key = ?").bind("s:" + participant),
          env.DB.prepare("DELETE FROM participants WHERE id = ?").bind(participant),
        ]),
    );
    return { ok: true };
  },

  // אין יותר הנפקת קישורים אישיים (הכרעת בעלים 10.10.2026). קישור ישן ממשיך להכניס עד שהחשבון מאומת.
  "POST /link/rotate": async () => {
    throw new HttpError(410, "link_retired");
  },

  // הרשמה = מייל + סיסמה (הכרעת בעלים 9.10.2026: כל חשבון עם מייל או Google; לא יותר מחשבון אחד לכל מייל).
  // נוצרים: משתתף, סיסמה, מייל (מוצפן + גיבוב ייחודי), שם (רשות), קישור אישי וסשן.
  "POST /auth/register": async ({ env, request, now, body }) => {
    const email = normalizeEmail(body.email ?? (String(body.username ?? "").includes("@") ? body.username : null));
    if (!email) throw bad("email_required");
    checkPassword(body.password);
    const name = body.name === undefined ? "" : normalizeName(body.name);
    if (name === null) throw bad("bad_name");
    await limitNewParticipant(env, request, now);
    const eh = await emailHash(env, email.norm);
    if (await emailTaken(env, eh, email)) throw new HttpError(409, "email_taken");
    const [stmts, participant] = await createParticipant(env, request, now, true);
    const h = await hashPassword(body.password);
    const [sess, token] = await newSession(env, participant, now, isClientToken(body.token) ? body.token : undefined);
    try {
      await env.DB.batch([
        ...stmts,
        env.DB.prepare("INSERT INTO credentials (participant, kind, hash, salt, iterations, algo, created_at) VALUES (?, 'password', ?, ?, ?, ?, ?)").bind(participant, h.hash, h.salt, h.iterations, h.algo, iso(now)),
        await emailRow(env, participant, eh, email.display, "password", 0, now),
        ...(name ? [await nameRow(env, participant, name, now)] : []),
        sess,
      ]);
    } catch {
      throw new HttpError(409, "email_taken");
    }
    return { token };
  },

  // אין יותר שמירה בלי חשבון בשרת (הכרעת בעלים 9.10.2026): בלי חשבון — הכול נשמר בדפדפן בלבד ולא נכנס לסטטיסטיקות.
  "POST /auth/guest": async () => {
    throw new HttpError(403, "account_required");
  },

  // כניסה עם Google. Google מאמת את המייל, ולכן: אותו מזהה Google ⇐ אותו חשבון · אחרת אותו מייל מאומת ⇐ אותו חשבון (Google מתווסף) ·
  // מחובר בלי Google ⇐ Google מתווסף אליו · אחרת חשבון חדש. מייל שמישהו אחר רשם בלי אימות — עובר לבעל ה-Google המאומת.
  "POST /auth/google": async ({ env, request, now, body }) => {
    const g = await verifyGoogle(env, body?.credential, now);
    if (!g) throw new HttpError(401, "bad_google");
    const clientToken = isClientToken(body?.token) ? body.token : undefined;
    if (clientToken && (await authenticate(env, clientToken, now))) return { token: clientToken };
    const gh = await sha256("google|" + g.sub);
    const email = g.emailVerified ? normalizeEmail(g.email) : null;
    const eh = email ? await emailHash(env, email.norm) : null;
    const owner = eh ? await env.DB.prepare("SELECT participant, verified FROM emails WHERE hash = ?").bind(eh).first() : null;
    const found = await env.DB.prepare("SELECT participant FROM credentials WHERE kind = 'google' AND google_sub = ?").bind(gh).first();
    const stmts = [];
    let participant = found?.participant;
    if (!participant && owner?.verified) participant = owner.participant;
    if (!participant) {
      const current = await authenticate(env, bearer(request), now);
      const hasGoogle = current && (await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'google'").bind(current.participant).first());
      if (current && !hasGoogle) participant = current.participant;
      else {
        const [created, id] = await createParticipant(env, request, now);
        stmts.push(...created);
        participant = id;
      }
    }
    // לחשבון יש כבר Google אחר עם אותו מייל מאומת — נכנסים בלי להוסיף מזהה שני
    const hasG = !found && (await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'google'").bind(participant).first());
    if (!found && !hasG) stmts.push(env.DB.prepare("INSERT INTO credentials (participant, kind, google_sub, created_at) VALUES (?, 'google', ?, ?)").bind(participant, gh, iso(now)));
    if (eh) {
      // מייל מאומת של Google: שייך לחשבון הזה. רישום לא מאומת של אותו מייל בחשבון אחר — מבוטל.
      if (owner && owner.participant !== participant) stmts.push(env.DB.prepare("DELETE FROM emails WHERE hash = ? AND verified = 0").bind(eh));
      if (!owner || owner.participant !== participant || !owner.verified) {
        if (owner?.participant === participant) stmts.push(env.DB.prepare("UPDATE emails SET verified = 1, source = 'google' WHERE hash = ?").bind(eh));
        else stmts.push(await emailRow(env, participant, eh, email.display, "google", 1, now));
      }
    }
    const [sess, token] = await newSession(env, participant, now, clientToken);
    await env.DB.batch([...stmts, sess]);
    await retireLegacy(env, participant, now);
    return { token };
  },

  // הוספת מייל וסיסמה לחשבון קיים (אורח ישן או שם משתמש): נדרש בכניסה הבאה (הכרעת בעלים 9.10.2026).
  // הסשן נשאר; לחשבון בלי קישור אישי נוצר קישור. סיסמה — חובה רק כשאין עדיין סיסמה ואין Google.
  "POST /auth/claim": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const email = normalizeEmail(body.email ?? body.username);
    if (!email) throw bad("email_required");
    if (!(await hit(env, "s:" + participant, LIMITS.savesPerHour, now))) throw new HttpError(429, "rate");
    const pw = await passwordCred(env, participant);
    const hasGoogle = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'google'").bind(participant).first();
    if (!pw && !hasGoogle) checkPassword(body.password);
    const eh = await emailHash(env, email.norm);
    const mine = await env.DB.prepare("SELECT participant FROM emails WHERE hash = ?").bind(eh).first();
    if (mine && mine.participant !== participant) throw new HttpError(409, "email_taken");
    if (!mine && (await emailTaken(env, eh, email))) throw new HttpError(409, "email_taken");
    const stmts = [];
    if (!mine) {
      stmts.push(env.DB.prepare("DELETE FROM emails WHERE participant = ? AND verified = 0").bind(participant));
      stmts.push(await emailRow(env, participant, eh, email.display, "added", 0, now));
    }
    if (!pw && !hasGoogle) {
      const h = await hashPassword(body.password);
      stmts.push(env.DB.prepare("INSERT INTO credentials (participant, kind, hash, salt, iterations, algo, created_at) VALUES (?, 'password', ?, ?, ?, ?, ?)").bind(participant, h.hash, h.salt, h.iterations, h.algo, iso(now)));
    }
    try {
      await env.DB.batch(stmts);
    } catch {
      throw new HttpError(409, "email_taken");
    }
    return { email: email.display };
  },

  // שם תצוגה (רשות) — נשמר מוצפן, מוצג רק לבעל החשבון
  "POST /account/name": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const name = normalizeName(body.name);
    if (name === null) throw bad("bad_name");
    if (!(await hit(env, "s:" + participant, LIMITS.savesPerHour, now))) throw new HttpError(429, "rate");
    await (name ? await nameRow(env, participant, name, now) : env.DB.prepare("DELETE FROM profile WHERE participant = ?").bind(participant)).run();
    return { name };
  },

  // אימות המייל (הכרעת בעלים 9.10.2026): Firebase שולח לכתובת מייל עם קישור; אחרי הלחיצה "בדקתי" מאשר את האימות.
  // מוגבל: 3 שליחות בשעה לחשבון, 5 ביום למייל, 10 בשעה ל-IP. המייל שנשלח אליו הוא רק זה שרשום בחשבון.
  "POST /account/verify/send": async ({ env, request, now }) => {
    const { participant } = await requireAuth(env, request, now);
    if (!env.FIREBASE_API_KEY) throw new HttpError(503, "verify_not_enabled");
    const row = await env.DB.prepare("SELECT hash, enc FROM emails WHERE participant = ? AND verified = 0 ORDER BY created_at LIMIT 1").bind(participant).first();
    if (!row) throw bad("nothing_to_verify");
    const [cur] = await ipKeys(env, request);
    if (!(await hit(env, "v:" + participant, 3, now)) || !(await hit(env, "vi:" + cur, 10, now)) || !(await hit(env, "ve:" + row.hash, 5, now, 24 * HOUR))) throw new HttpError(429, "slow_down");
    const email = await open(env, row.enc);
    if (!email) throw new HttpError(500, "server");
    try {
      let idToken = await firebaseSession(env, participant, email);
      if (!idToken) {
        const password = fb.randomPassword();
        idToken = await fb.signUp(env, email, password);
        await env.DB.prepare("INSERT INTO email_verify (participant, fb_enc, created_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET fb_enc = excluded.fb_enc, created_at = excluded.created_at").bind(participant, await seal(env, password), iso(now)).run();
      }
      await fb.sendVerify(env, idToken, env.SITE_URL ? `${env.SITE_URL}#/support` : undefined);
    } catch (e) {
      throw fbFailure(e);
    }
    return { sent: true };
  },

  // דף האימות באתר (הכרעת בעלים 9.10.2026: עדיף דף באתר מאשר דף של Firebase): הקישור שבמייל מוביל לאתר עצמו, והדפדפן שולח לכאן את הקוד.
  // הקוד הוא הוכחה שהגולש שולט בתיבת המייל, ולכן אין צורך בסשן — אפשר לפתוח את הקישור גם במכשיר אחר.
  "POST /auth/verify-email": async ({ env, request, now, body }) => {
    const code = typeof body.oobCode === "string" && /^[\w-]{10,300}$/.test(body.oobCode) ? body.oobCode : null;
    if (!code) throw bad("bad_code");
    const [cur] = await ipKeys(env, request);
    if (!(await hit(env, "va:" + cur, 30, now))) throw new HttpError(429, "slow_down");
    let email;
    try {
      const info = await fb.checkCode(env, code);
      if (info.requestType !== "VERIFY_EMAIL" || typeof info.email !== "string") throw bad("bad_code");
      await fb.applyCode(env, code);
      email = info.email;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (e instanceof fb.FirebaseError && /OOB_CODE|INVALID_ID_TOKEN/.test(e.code)) throw bad(/EXPIRED/.test(e.code) ? "expired_code" : "bad_code");
      throw fbFailure(e);
    }
    const n = normalizeEmail(email);
    if (!n) throw bad("bad_code");
    const row = await env.DB.prepare("SELECT participant FROM emails WHERE hash = ?").bind(await emailHash(env, n.norm)).first();
    if (!row) return { verified: true, account: false };
    await env.DB.prepare("UPDATE emails SET verified = 1 WHERE participant = ? AND hash = ?").bind(row.participant, await emailHash(env, n.norm)).run();
    await dropFirebaseUser(env, row.participant);
    await env.DB.prepare("DELETE FROM email_verify WHERE participant = ?").bind(row.participant).run();
    await retireLegacy(env, row.participant, now);
    return { verified: true, account: true };
  },

  "POST /account/verify/check": async ({ env, request, now }) => {
    const { participant } = await requireAuth(env, request, now);
    const row = await env.DB.prepare("SELECT hash, enc, verified FROM emails WHERE participant = ? ORDER BY verified DESC, created_at LIMIT 1").bind(participant).first();
    if (!row) throw bad("nothing_to_verify");
    if (row.verified) return { verified: true };
    if (!(await hit(env, "vc:" + participant, 30, now))) throw new HttpError(429, "slow_down");
    const email = await open(env, row.enc);
    const idToken = email ? await firebaseSession(env, participant, email) : null;
    if (!idToken) throw bad("not_sent");
    try {
      if (!(await fb.isVerified(env, idToken))) return { verified: false };
    } catch (e) {
      throw fbFailure(e);
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE emails SET verified = 1 WHERE hash = ? AND participant = ?").bind(row.hash, participant),
      env.DB.prepare("DELETE FROM email_verify WHERE participant = ?").bind(participant),
    ]);
    try { await fb.removeUser(env, idToken); } catch { /* נשאר ב-Firebase, בלי נתונים שלנו */ }
    await retireLegacy(env, participant, now);
    return { verified: true };
  },

  // קביעת סיסמה לחשבון בלי סיסמה (למשל Google בלבד). להחלפת סיסמה קיימת — /auth/password
  "POST /account/password": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    if (await passwordCred(env, participant)) throw bad("has_password");
    if (!(await env.DB.prepare("SELECT 1 AS x FROM emails WHERE participant = ?").bind(participant).first())) throw bad("email_required");
    checkPassword(body.password);
    const h = await hashPassword(body.password);
    await env.DB.prepare("INSERT INTO credentials (participant, kind, hash, salt, iterations, algo, created_at) VALUES (?, 'password', ?, ?, ?, ?, ?)").bind(participant, h.hash, h.salt, h.iterations, h.algo, iso(now)).run();
    return { ok: true };
  },

  // כניסה: מייל + סיסמה (או שם משתמש ישן + סיסמה)
  "POST /auth/login": async ({ env, request, now, body }) => {
    const raw = String(body.email ?? body.username ?? "");
    const email = raw.includes("@") ? normalizeEmail(raw) : null;
    const u = email ? null : normalizeUsername(raw);
    const ips = await ipKeys(env, request);
    const keys = ["fi:" + ips[0], "fa:" + (await hmac(env.IP_KEY, "user|" + (email?.norm ?? u?.norm ?? raw)))];
    const wait = await waitMs(env, [...keys, ...ips.slice(1).map((k) => "fi:" + k)], now);
    if (wait > 0) throw new HttpError(429, "slow_down", { retryAfter: Math.ceil(wait / 1000) });
    let cred = null;
    let legacyEmail = false;
    if (email) {
      const row = await env.DB.prepare("SELECT participant FROM emails WHERE hash = ?").bind(await emailHash(env, email.norm)).first();
      if (row) cred = await passwordCred(env, row.participant);
      if (!cred) {
        // חשבון ישן שנרשם עם המייל כשם משתמש (גלוי במאגר) — עובר אחרי הכניסה לשמירה מוצפנת
        cred = await env.DB.prepare("SELECT * FROM credentials WHERE kind = 'password' AND username_norm = ?").bind(email.display).first();
        legacyEmail = !!cred;
      }
    } else if (u) cred = await env.DB.prepare("SELECT * FROM credentials WHERE kind = 'password' AND username_norm = ?").bind(u.norm).first();
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
    if (legacyEmail) stmts.push(...(await migrateLegacyEmail(env, cred, now)));
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
    return { token, username: cred?.username ?? null, email: await firstEmail(env, participant) };
  },

  // שחזור: הקישור האישי + סיסמה חדשה ⇐ סשן רגיל; שאר הסשנים מבוטלים, הקישור נשאר.
  "POST /auth/recover": async ({ env, request, now, body }) => {
    const { participant, keys } = await linkOwner(env, request, now, body.link);
    const cred = await passwordCred(env, participant);
    if (!cred) throw bad("no_password");
    checkPassword(body.password);
    await clearFails(env, keys);
    return { token: await setPassword(env, participant, body.password, now), username: cred.username, email: await firstEmail(env, participant) };
  },

  // איפוס סיסמה במייל (הכרעת בעלים 10.10.2026) — לכל חשבון עם מייל וסיסמה, גם כשהמייל עוד לא אומת: פתיחת המייל מוכיחה בעלות,
  // ובסיום האיפוס המייל מסומן מאומת. Firebase משמש רק לשליחת המייל:
  // הקישור שבו חוזר לאתר עם סוד חד-פעמי (RESET_TTL), שנמצא רק במייל — מי שפתח את המייל הוא היחיד שיכול לקבוע סיסמה חדשה.
  // התשובה זהה בין אם יש חשבון ובין אם לא (אין בדיקת "מי רשום"); 3 בקשות ביום למייל, 10 בשעה ל-IP.
  "POST /auth/forgot": async ({ env, request, now, body }) => {
    const email = normalizeEmail(body.email);
    if (!email) throw bad("email_required");
    if (!env.FIREBASE_API_KEY) throw new HttpError(503, "verify_not_enabled");
    const [cur] = await ipKeys(env, request);
    if (!(await hit(env, "fg:" + cur, 10, now))) throw new HttpError(429, "slow_down");
    const eh = await emailHash(env, email.norm);
    const row = await env.DB.prepare("SELECT participant, enc FROM emails WHERE hash = ?").bind(eh).first();
    const cred = row ? await passwordCred(env, row.participant) : null;
    if (!row || !cred || !(await hit(env, "fe:" + eh, 3, now, 24 * HOUR))) return { sent: true };
    const address = await open(env, row.enc);
    if (!address) throw new HttpError(500, "server");
    try {
      // משתמש זמני חדש בכל בקשה: משתמש ישן שכבר נלחץ בו הקישור לא מועבר הלאה
      const old = await firebaseSession(env, row.participant, address);
      if (old) await fb.removeUser(env, old).catch(() => {});
      const password = fb.randomPassword();
      const idToken = await fb.signUp(env, address, password);
      const secret = randomToken(24);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO email_verify (participant, fb_enc, created_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET fb_enc = excluded.fb_enc, created_at = excluded.created_at").bind(row.participant, await seal(env, password), iso(now)),
        env.DB.prepare("INSERT INTO password_reset (participant, secret_hash, created_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET secret_hash = excluded.secret_hash, created_at = excluded.created_at").bind(row.participant, await sha256(secret), iso(now)),
        env.DB.prepare("INSERT INTO password_reset_email (participant, email_hash) VALUES (?, ?) ON CONFLICT(participant) DO UPDATE SET email_hash = excluded.email_hash").bind(row.participant, eh),
      ]);
      await fb.sendVerify(env, idToken, `${env.SITE_URL || ""}?reset=${secret}`, { strict: true });
    } catch (e) {
      throw fbFailure(e);
    }
    return { sent: true };
  },

  // קביעת סיסמה חדשה עם הסוד מהמייל ⇐ סשן רגיל; כל שאר הסשנים מבוטלים, הקישור האישי נשאר. הסוד חד-פעמי.
  "POST /auth/reset": async ({ env, request, now, body }) => {
    const secret = typeof body.secret === "string" && /^[\w-]{20,100}$/.test(body.secret) ? body.secret : null;
    const ips = await ipKeys(env, request);
    const keys = ["fi:" + ips[0]];
    const wait = await waitMs(env, [...keys, ...ips.slice(1).map((k) => "fi:" + k)], now);
    if (wait > 0) throw new HttpError(429, "slow_down", { retryAfter: Math.ceil(wait / 1000) });
    const r = secret ? await env.DB.prepare("SELECT participant, created_at FROM password_reset WHERE secret_hash = ?").bind(await sha256(secret)).first() : null;
    if (!r || Date.parse(r.created_at) < now - RESET_TTL) {
      await recordFail(env, keys, now);
      throw new HttpError(401, "bad_reset");
    }
    checkPassword(body.password);
    if (!(await passwordCred(env, r.participant))) throw new HttpError(401, "bad_reset");
    await clearFails(env, keys);
    const token = await setPassword(env, r.participant, body.password, now);
    const target = await env.DB.prepare("SELECT email_hash FROM password_reset_email WHERE participant = ?").bind(r.participant).first();
    if (target) await env.DB.prepare("UPDATE emails SET verified = 1 WHERE participant = ? AND hash = ?").bind(r.participant, target.email_hash).run();
    const idToken = await firebaseSession(env, r.participant, (await firstEmail(env, r.participant)) ?? "");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM password_reset WHERE participant = ?").bind(r.participant),
      env.DB.prepare("DELETE FROM password_reset_email WHERE participant = ?").bind(r.participant),
      env.DB.prepare("DELETE FROM email_verify WHERE participant = ?").bind(r.participant),
    ]);
    if (idToken) await fb.removeUser(env, idToken).catch(() => {});
    await retireLegacy(env, r.participant, now);
    return { token };
  },

  // ---- ממשק ניהול (דרך שרת ההערות בלבד): שיחות תמיכה של משתתפים מאומתים ומספרים כלליים. מפתח בכותרת x-admin-key.
  "GET /admin/support": async ({ env, request }) => {
    await requireAdmin(env, request);
    const { results: threads } = await env.DB.prepare("SELECT participant, created_at, updated_at, status FROM support_threads ORDER BY updated_at DESC").all();
    const { results: msgs } = await env.DB.prepare("SELECT id, participant, author, text, created_at FROM support_messages ORDER BY id").all();
    const stats = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM participants) AS participants, (SELECT COUNT(*) FROM participants WHERE created_at >= date('now')) AS participantsToday, (SELECT COUNT(DISTINCT participant) FROM versions) AS savers, (SELECT COUNT(DISTINCT participant) FROM versions WHERE created_at >= date('now')) AS saversToday, (SELECT COUNT(*) FROM versions WHERE created_at >= date('now')) AS savesToday, (SELECT COUNT(*) FROM participants p WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.participant = p.id) AND EXISTS (SELECT 1 FROM credentials c WHERE c.participant = p.id AND c.kind = 'password')) AS accountsNoSave, (SELECT COUNT(*) FROM participants p WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.participant = p.id) AND NOT EXISTS (SELECT 1 FROM credentials c WHERE c.participant = p.id)) AS emptyGuests, (SELECT COUNT(DISTINCT participant) FROM emails WHERE verified = 1 AND source <> 'google') AS verifiedEmails, (SELECT COUNT(DISTINCT participant) FROM credentials WHERE kind = 'google') AS googleAccounts").first();
    return { stats, threads: (threads || []).map((t) => ({ ...t, messages: (msgs || []).filter((m) => m.participant === t.participant).map(({ participant: _p, ...m }) => m) })) };
  },
  // שרת ההערות בודק כאן אם הסשן או המפתח שקיבל שייכים למנהל (חשבון מנהל נכנס לממשק הניהול בלי קישור)
  "GET /admin/whoami": async ({ env, request }) => {
    await requireAdmin(env, request);
    return { ok: true };
  },
  // דשבורד השערות למנהל (הכרעת בעלים 9.10.2026): כל ההשערות, בלי שום מזהה — בלי מזהה משתתף, גרסה או פעולה, בלי שעה (יום בלבד),
  // בסדר אקראי בכל טעינה. לכל השערה "ידית" חד-פעמית (HMAC עם מלח אקראי של הטעינה) שמשמשת רק לאישור או לדחייה.
  "GET /admin/guesses": async ({ env, request }) => {
    await requireAdmin(env, request);
    const { latest, mod, review, verified, blocsBy } = await moderationState(env);
    const salt = randomToken(12);
    const rows = [];
    for (const v of latest) {
      const reasons = mod.pending.get(v.id) ?? [];
      const decision = mod.decisions.get(v.id) ?? null;
      const status = review.has(v.participant) ? "review" : decision ?? (reasons.length ? "pending" : "ok");
      rows.push({
        handle: (await hmac(env.IP_KEY, `guess|${salt}|${v.id}`)).slice(0, 32),
        day: v.created_at.slice(0, 10),
        mode: v.payload.mode === "pct" ? "pct" : "seats",
        seats: Object.fromEntries(Object.entries(v.payload.seats || {}).map(([id, c]) => [id, c?.v ?? 0])),
        ...(v.payload.mode === "pct" && v.payload.pct ? { pct: v.payload.pct } : {}),
        status,
        verified: verified.has(v.participant),
        reasons: reasons.length ? reasons : mod.raw.get(v.id) ?? [],
        blocs: blocsOf(v.payload, blocsBy.get(v.participant) ?? null),
      });
    }
    for (let i = rows.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    // האזור הנפרד בניהול: חשבונות שלא אומתו — כמה, וממוצע המנדטים שלהם לכל רשימה (בלי מזהים). הם נספרים בסטטיסטיקות כרגיל.
    const unv = rows.filter((r) => !r.verified);
    const means = Object.fromEntries(IDS_2026_LIST.map((id) => [id, unv.length ? Math.round((unv.reduce((a, r) => a + (r.seats[id] ?? 0), 0) / unv.length) * 100) / 100 : 0]));
    return { salt, rows, unverified: { participants: unv.length, means } };
  },

  // אישור / דחייה / ביטול החלטה — לפי ידית מהטעינה (salt + handle). אין קלט של מזהה גרסה או משתתף.
  "POST /admin/guesses/decide": async ({ env, request, now, body }) => {
    await requireAdmin(env, request);
    const decision = body.decision;
    if (!["approved", "rejected", "clear"].includes(decision)) throw bad("decision");
    if (typeof body.salt !== "string" || typeof body.handle !== "string" || !/^[\w-]{8,40}$/.test(body.salt) || !/^[0-9a-f]{32}$/.test(body.handle)) throw bad("handle");
    const { latest } = await moderationState(env);
    let target = null;
    for (const v of latest) if ((await hmac(env.IP_KEY, `guess|${body.salt}|${v.id}`)).slice(0, 32) === body.handle) { target = v; break; }
    if (!target) throw new HttpError(404, "not_found");
    if (decision === "clear") await env.DB.prepare("DELETE FROM version_review WHERE version_id = ?").bind(target.id).run();
    else
      await env.DB.prepare("INSERT INTO version_review (version_id, decision, decided_at) VALUES (?, ?, ?) ON CONFLICT(version_id) DO UPDATE SET decision = excluded.decision, decided_at = excluded.decided_at")
        .bind(target.id, decision, iso(now))
        .run();
    return { ok: true };
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

/** ⇐ {dashboard, pending: Map(versionId ⇐ reasons)} — pending נשאר בשרת בלבד */
async function dashboardState(env) {
  const at = clock(env);
  if (dashboardCache && at >= dashboardCache.at && at - dashboardCache.at < DASHBOARD_TTL_MS) return dashboardCache.data;
  const data = await computeDashboard(env);
  dashboardCache = { at, data };
  return data;
}
const dashboard = async (env) => (await dashboardState(env)).dashboard;

async function computeDashboard(env) {
  // תמונה עדכנית, בלי כתיבה ובלי להמתין למשימה השעתית.
  // התשובות האישיות נשארות בשרת; רק התוצאה המצטברת יוצאת לדפדפן.
  const now = iso(clock(env));
  const data = await env.DB.batch([
    env.DB.prepare(PARTICIPANTS_SQL),
    env.DB.prepare("SELECT id, participant, unit, created_at, payload FROM versions ORDER BY id"),
    env.DB.prepare("SELECT composition, name FROM bloc_display_names WHERE status = 'approved'"),
    env.DB.prepare("SELECT version_id, decision FROM version_review"),
  ]);
  const participants = data[0].results || [];
  const decisions = new Map((data[3].results || []).map((r) => [r.version_id, r.decision]));
  const versions = (data[1].results || []).map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  const blocNames = Object.fromEntries((data[2].results || []).map(r => [r.composition, r.name]));
  const res = aggregate({ participants, versions, now, blocNames, decisions, aggregationId: `live-${now}` });
  return { dashboard: res.dashboard, pending: res.pending };
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
  const participants = (await env.DB.prepare(PARTICIPANTS_SQL).all()).results || [];
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
  const decisions = await loadDecisions(env);
  const res = aggregate({ blocNames, wasOpen, participants, versions, now: iso(now), previous, lastDailyDay: dailyRow ? JSON.parse(dailyRow.json).day : null, aggregationId, decisions });
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
    env.DB.prepare("DELETE FROM password_reset WHERE created_at < ?").bind(iso(now - RESET_TTL)),
    env.DB.prepare("DELETE FROM password_reset_email WHERE participant NOT IN (SELECT participant FROM password_reset)"),
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
