/**
 * שרת השתתפות הגולשים — "ההשערה שלי" ודשבורד הגולשים (Cloudflare Worker + D1 ‏elections26-crowd).
 * השיטה: docs/השתתפות-גולשים.md · החוזה (נתיבים וצורות תשובה): src/lib/crowdApi.ts — השרת מממש בדיוק אותו.
 * בלי "אני לא רובוט" (הכרעת בעלים); ההגנה: הגבלת קצב, גרסה אחרונה בלבד, זיהוי חריגות.
 * בלי עוגיות — הזהות רק בכותרת Authorization, ולכן אין חשיפה ל-CSRF.
 *
 * סודות (wrangler secret): IP_KEY, LOOKUP_KEY, EMAIL_KEY; רשות: IP_KEY_PREV (24 שעות אחרי החלפה), RESEND_API_KEY.
 * cron כל שעה: ניקוי מונים ישנים, זיהוי חריגות, צבירה ופרסום.
 */
import { randomToken, sha256, hmac, hashPassword, verifyPassword, encrypt, decrypt, PBKDF2_ITERATIONS } from "./lib/crypto.js";
import { bearer, authenticate, newSession, ipKeys, hit, waitMs, recordFail, clearFails, HOUR } from "./lib/auth.js";
import { validateSave, UNITS, normalizeUsername, passwordProblem, normalizeEmail } from "./lib/validate.js";
import { aggregate, HOURLY, DAILY } from "./lib/aggregate.js";
import { detectHour, BASELINE_HOURS } from "./lib/anomaly.js";

export const LIMITS = { savesPerHour: 20, participantsPerHourPerIp: 5, forgotPerHourPerIp: 10 };
const EMAIL_KEY_VERSION = 1;
const LOOKUP_KEY_VERSION = 1;
const RESET_MS = 30 * 60 * 1000;
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

async function requireAuth(env, request, now) {
  const a = await authenticate(env, bearer(request), now);
  if (!a) throw new HttpError(401, "unauthorized");
  return a;
}

/** משתתף אנונימי חדש (עם הגבלה לפי IP) ⇐ [statements, participantId] */
async function createParticipant(env, request, now) {
  const [cur, ...prev] = await ipKeys(env, request);
  if (!(await hit(env, "p:" + cur, LIMITS.participantsPerHourPerIp, now, HOUR, prev.map((k) => "p:" + k)))) throw new HttpError(429, "rate");
  const id = randomToken(16);
  return [[env.DB.prepare("INSERT INTO participants (id, created_at) VALUES (?, ?)").bind(id, iso(now))], id];
}

const parseVersion = (r) => ({ id: r.id, unit: r.unit, created_at: r.created_at, payload: JSON.parse(r.payload) });

// ---- מייל (Resend). בלי RESEND_API_KEY או MAIL_FROM — לא נשלח כלום.
export async function sendMail(env, to, subject, bodyHtml) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  const html = `<div dir="rtl" lang="he" style="font-family:Arial,sans-serif;text-align:right;line-height:1.6">${bodyHtml}<p style="color:#666;font-size:13px">ההודעה נשלחה מאתר ניתוח הבחירות לכנסת ה-26. אם לא ביקשת אותה — אפשר להתעלם.</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
  }).catch(() => null);
  return !!res?.ok;
}

async function currentEmail(env, participant) {
  const row = await env.DB.prepare("SELECT ciphertext, nonce FROM recovery_emails WHERE participant = ?").bind(participant).first();
  if (!row) return null;
  try {
    return await decrypt(env.EMAIL_KEY, row.ciphertext, row.nonce);
  } catch {
    return null;
  }
}

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

const DUMMY = { algo: "pbkdf2-sha256", salt: "AAAAAAAAAAAAAAAAAAAAAA==", iterations: PBKDF2_ITERATIONS, hash: "0".repeat(64) };

// ---- הנתיבים
const routes = {
  "POST /participant": async ({ env, request, now }) => {
    const [stmts, id] = await createParticipant(env, request, now);
    const token = randomToken();
    await env.DB.batch([
      ...stmts,
      env.DB.prepare("INSERT INTO credentials (participant, kind, token_hash, created_at) VALUES (?, 'link', ?, ?)").bind(id, await sha256(token), iso(now)),
    ]);
    return { token };
  },

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
    const email = await env.DB.prepare("SELECT 1 AS x FROM recovery_emails WHERE participant = ?").bind(participant).first();
    const g = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE participant = ? AND kind = 'google'").bind(participant).first();
    return { participant: p.id, created_at: p.created_at, latest, username: pw?.username ?? null, hasEmail: !!email, google: !!g };
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
      versions: versions.map((r) => ({ ...parseVersion(r), op_id: r.op_id, registry: r.registry })),
      credentials: creds,
      email: await currentEmail(env, participant),
      sessions: sessions.map((s) => ({ ...s, revoked: !!s.revoked })),
    };
  },

  "POST /delete": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    if (body.confirm !== "מחק") throw bad("confirm");
    await env.DB.batch(
      ["versions", "credentials", "sessions", "recovery_emails", "pending_emails", "resets"]
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
    return { token };
  },

  "POST /auth/register": async ({ env, request, now, body }) => {
    const u = normalizeUsername(body.username);
    if (!u) throw bad("bad_username");
    checkPassword(body.password);
    const auth = await authenticate(env, bearer(request), now);
    let stmts = [];
    let participant = auth?.participant;
    if (participant) {
      if (await passwordCred(env, participant)) throw new HttpError(409, "already_registered");
    } else {
      [stmts, participant] = await createParticipant(env, request, now);
    }
    const taken = await env.DB.prepare("SELECT 1 AS x FROM credentials WHERE username_norm = ?").bind(u.norm).first();
    if (taken) throw new HttpError(409, "username_taken");
    const h = await hashPassword(body.password);
    const [sess, token] = await newSession(env, participant, now);
    try {
      await env.DB.batch([
        ...stmts,
        env.DB.prepare(
          "INSERT INTO credentials (participant, kind, username, username_norm, hash, salt, iterations, algo, created_at) VALUES (?, 'password', ?, ?, ?, ?, ?, ?, ?)",
        ).bind(participant, u.display, u.norm, h.hash, h.salt, h.iterations, h.algo, iso(now)),
        sess,
      ]);
    } catch {
      throw new HttpError(409, "username_taken");
    }
    return { token };
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
    else if (a.session) await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE token_hash = ?").bind(a.session).run();
    return { ok: true };
  },

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

  "POST /auth/email": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    if (!(await passwordCred(env, participant))) throw bad("no_username");
    const old = await currentEmail(env, participant);
    if (body.email === null) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM recovery_emails WHERE participant = ?").bind(participant),
        env.DB.prepare("DELETE FROM pending_emails WHERE participant = ?").bind(participant),
      ]);
      if (old) await sendMail(env, old, "המייל לשחזור הוסר", "<p>המייל הזה הוסר מחשבון ההשערות שלך באתר. אם לא עשית זאת — היכנס לחשבון והחלף סיסמה.</p>");
      return { ok: true };
    }
    const email = normalizeEmail(body.email);
    if (!email) throw bad("bad_email");
    const [cur] = await ipKeys(env, request);
    if (!(await hit(env, "m:" + cur, LIMITS.forgotPerHourPerIp, now))) throw new HttpError(429, "rate");
    const enc = await encrypt(env.EMAIL_KEY, email);
    const token = randomToken();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM pending_emails WHERE participant = ?").bind(participant),
      env.DB.prepare(
        "INSERT INTO pending_emails (participant, ciphertext, nonce, key_version, lookup_hmac, lookup_key_version, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(participant, enc.ciphertext, enc.nonce, EMAIL_KEY_VERSION, await hmac(env.LOOKUP_KEY, email), LOOKUP_KEY_VERSION, await sha256(token), iso(now), iso(now + RESET_MS)),
    ]);
    const link = `${env.SITE_URL}#/guess?verify=${token}`;
    await sendMail(
      env,
      email,
      "אימות מייל לשחזור",
      `<p>כדי שהמייל הזה ישמש לשחזור הסיסמה בחשבון ההשערות שלך, לחץ על הקישור (בתוקף 30 דקות):</p><p><a href="${link}">${link}</a></p>`,
    );
    return { ok: true, pending: true };
  },

  "POST /auth/email/verify": async ({ env, now, body }) => {
    if (typeof body.verify !== "string" || body.verify.length > 100) throw bad("bad_token");
    const row = await env.DB.prepare("SELECT * FROM pending_emails WHERE token_hash = ? AND expires_at > ?").bind(await sha256(body.verify), iso(now)).first();
    if (!row) throw bad("bad_token");
    const old = await currentEmail(env, row.participant);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM recovery_emails WHERE participant = ?").bind(row.participant),
      env.DB.prepare(
        "INSERT INTO recovery_emails (participant, ciphertext, nonce, key_version, lookup_hmac, lookup_key_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(row.participant, row.ciphertext, row.nonce, row.key_version, row.lookup_hmac, row.lookup_key_version, iso(now)),
      env.DB.prepare("DELETE FROM pending_emails WHERE participant = ?").bind(row.participant),
    ]);
    const neu = await decrypt(env.EMAIL_KEY, row.ciphertext, row.nonce).catch(() => null);
    if (old && old !== neu)
      await sendMail(env, old, "המייל לשחזור הוחלף", "<p>המייל לשחזור בחשבון ההשערות שלך הוחלף בכתובת אחרת. אם לא עשית זאת — היכנס לחשבון והחלף סיסמה.</p>");
    return { ok: true };
  },

  "POST /auth/forgot": async ({ env, request, now, body }) => {
    const [cur, ...prev] = await ipKeys(env, request);
    if (!(await hit(env, "f:" + cur, LIMITS.forgotPerHourPerIp, now, HOUR, prev.map((k) => "f:" + k)))) return { ok: true };
    const u = normalizeUsername(body.username);
    const cred = u ? await env.DB.prepare("SELECT participant FROM credentials WHERE kind = 'password' AND username_norm = ?").bind(u.norm).first() : null;
    if (!cred) return { ok: true };
    const email = await currentEmail(env, cred.participant);
    if (!email || !env.RESEND_API_KEY || !env.MAIL_FROM) return { ok: true };
    const token = randomToken();
    await env.DB.batch([
      env.DB.prepare("UPDATE resets SET used = 1 WHERE participant = ? AND used = 0").bind(cred.participant),
      env.DB.prepare("INSERT INTO resets (token_hash, participant, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), cred.participant, iso(now), iso(now + RESET_MS)),
    ]);
    const link = `${env.SITE_URL}#/guess?reset=${token}`;
    await sendMail(env, email, "איפוס סיסמה", `<p>לבחירת סיסמה חדשה לחשבון ההשערות שלך, לחץ על הקישור (חד-פעמי, בתוקף 30 דקות):</p><p><a href="${link}">${link}</a></p>`);
    return { ok: true };
  },

  "POST /auth/reset": async ({ env, now, body }) => {
    if (typeof body.reset !== "string" || body.reset.length > 100) throw bad("bad_token");
    const th = await sha256(body.reset);
    const row = await env.DB.prepare("SELECT participant FROM resets WHERE token_hash = ? AND used = 0 AND expires_at > ?").bind(th, iso(now)).first();
    if (!row) throw bad("bad_token");
    checkPassword(body.password);
    await env.DB.prepare("UPDATE resets SET used = 1 WHERE token_hash = ?").bind(th).run();
    return { token: await setPassword(env, row.participant, body.password, now) };
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

async function dashboard(env) {
  const row = await env.DB.prepare("SELECT json FROM aggregates WHERE section = 'dashboard' ORDER BY id DESC LIMIT 1").first();
  return row ? JSON.parse(row.json) : { publishedAt: null, aggregationId: null, participants: 0, open: false, underReview: null };
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
    if (r) previous[name] = { json: r.json === null ? null : JSON.parse(r.json), publishedAt: r.published_at, snapshot: JSON.parse(r.snapshot || "[]") };
  }
  const dailyRow = await env.DB.prepare("SELECT json FROM aggregates WHERE section = 'daily' ORDER BY id DESC LIMIT 1").first();
  const lastDash = await env.DB.prepare("SELECT json FROM aggregates WHERE section = 'dashboard' ORDER BY id DESC LIMIT 1").first();
  const wasOpen = lastDash ? !!JSON.parse(lastDash.json).open : false;
  const res = aggregate({ wasOpen, participants, versions, now: iso(now), previous, lastDailyDay: dailyRow ? JSON.parse(dailyRow.json).day : null, aggregationId });
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
    env.DB.prepare("DELETE FROM resets WHERE expires_at < ?").bind(iso(now - 24 * HOUR)),
    env.DB.prepare("DELETE FROM pending_emails WHERE expires_at < ?").bind(iso(now)),
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
      if (request.method === "GET" && url.pathname === "/dashboard")
        return new Response(JSON.stringify(await dashboard(env)), { headers: { ...headers, "cache-control": "public, max-age=300" } });
      const handler = routes[`${request.method} ${url.pathname}`];
      if (!handler) throw new HttpError(404, "not_found");
      const body = request.method === "POST" ? await readJson(request) : {};
      if (body === null || typeof body !== "object" || Array.isArray(body)) throw bad("bad_json");
      const out = await handler({ env, request, url, now, body });
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
    const now = clock(env);
    const job = (async () => {
      await cleanup(env, now);
      await runAggregation(env, now);
    })();
    if (ctx?.waitUntil) ctx.waitUntil(job);
    await job;
  },
};
