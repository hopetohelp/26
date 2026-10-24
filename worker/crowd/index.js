import { accountCount } from "./lib/accountCount.js";
import { cleanDataPreference } from "../../src/lib/dataPreferences.ts";
import { personalTotals, migrateBlocs, compositionKey } from "./lib/blocDefinitions.js";
import { allowedOrigin, returnSiteUrl } from "../shared/origins.js";
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
import { setPollRanges, moderate, flagReasons, pollRange } from "./lib/moderation.js";
import { normalizeEmail, normalizeName, emailHash, emailHasher, seal, open } from "./lib/identity.js";
import * as fb from "./lib/firebase.js";
import { LISTS_2026 } from "./lib/lists.js";
import { slugFromName, freeSlug } from "./lib/slug.js";
import { AGENT_SESSION_MS, MAX_AGENTS, agentBodyAllowed, agentRoute, agentSession, clientLabel, connectionId, requestToken } from "./lib/agent.js";

const IDS_2026_LIST = LISTS_2026.map((l) => l.id);

// שמירה אוטומטית בכל שינוי (הכרעת בעלים 9.10.2026) — המכסה הוגדלה מ-20
export const LIMITS = { savesPerHour: 120, participantsPerHourPerIp: 15 };
const MAX_BODY = 16 * 1024;
/** תמונת קבוצה: עד IMAGE_MAX בתים אחרי פענוח; הבקשה נושאת אותה כ-base64 */
export const IMAGE_MAX = 150 * 1024;
const IMAGE_BODY = 220 * 1024;
const IMAGE_ROUTES = new Set(["POST /group/image", "POST /admin/groups/image"]);
const HANDOFF_BODY = 220 * 1024;
/** העלאת רשימה בשלבים: עד UPLOAD_MAX מיילים בבקשה */
const UPLOAD_BODY = 220 * 1024;
const UPLOAD_ROUTES = new Set(["POST /group/upload", "POST /admin/groups/upload"]);
const HANDOFF_TTL = 10 * 60 * 1000;
const HANDOFF_RECEIPT_TTL = 30 * 24 * HOUR;
const LEGACY_KEY = /^(?:elections26\.(?:crowd\.(?:token|link|linkAck|consent|intro|picture|(?:draft|saved|pending)\.(?:seats|blocs|vote))|feedback(?:\.outbox)?|camps|lineage|source\.v1\.[\w-]+|mode|vid|noCount|supportSeen|install\.dismissed|drawerSeen\.[\w-]+)|g-seen:[\w-]+)$/;
const RESET_TTL = 30 * 60 * 1000;

function cors(env, origin) {
  return {
    ...(allowedOrigin(env, origin) ? { "access-control-allow-origin": origin } : {}),
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

async function readJson(request, max = MAX_BODY) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "too_large");
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

async function myGroups(env, participant) {
  const rows = (await env.DB.prepare("SELECT DISTINCT g.id, g.name_enc, l.slug, i.updated_at AS image FROM (" + groupParticipants({ participant: "?1" }) + ") x JOIN groups g ON g.id = x.group_id LEFT JOIN group_links l ON l.group_id = g.id LEFT JOIN group_images i ON i.group_id = g.id ORDER BY g.id").bind(participant).all()).results || [];
  return Promise.all(rows.map(async (r) => ({ id: r.id, name: await open(env, r.name_enc), slug: r.slug ?? null, image: r.image ?? null })));
}

/** תחילת היום הנוכחי בשעון ישראל (ISO, UTC) — ל"נרשמו היום" */
function israelDayStart(now) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now));
  for (const off of [3, 2]) { const t = Date.parse(`${day}T00:00:00+0${off}:00`); if (new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(t)) === day) return iso(t); }
  return iso(Date.parse(day + "T00:00:00Z"));
}

async function removeManager(env, id, eh) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM group_managers WHERE group_id = ? AND email_hash = ?").bind(id, eh),
    env.DB.prepare("DELETE FROM group_manager_labels WHERE group_id = ? AND email_hash = ?").bind(id, eh),
  ]);
}

/** שני המתגים עם מספר עדכני לכל אחד, כמה מרשימת המיילים מחוברים, וכמה חשבונות באתר בכלל.
 *  מספרי הקבוצה מוצגים רק מ-GROUP_MIN (כמו המספרים למנהל): ברשימה קטנה מספר מדויק היה מגלה אם אדם מסוים נרשם. */
async function linkMembers(env, id) {
  const r = await env.DB.prepare(
    `SELECT (SELECT on_ FROM group_link_flags WHERE group_id = ?1 AND flag = 'all') AS all_on,
            (SELECT on_ FROM group_link_flags WHERE group_id = ?1 AND flag = 'first') AS first_on,
            (SELECT COUNT(*) FROM group_link_joins WHERE group_id = ?1) AS all_n,
            (SELECT COUNT(*) FROM group_link_first WHERE group_id = ?1) AS first_n,
            (SELECT COUNT(DISTINCT e.participant) FROM emails e CROSS JOIN group_members m ON m.group_id = ?1 AND m.email_hash = e.hash WHERE e.verified = 1) AS list_n,
            (SELECT COUNT(*) FROM participants p WHERE EXISTS (SELECT 1 FROM credentials c WHERE c.participant = p.id)) AS site_n`,
  ).bind(id).first();
  const shown = (n) => (n >= GROUP_MIN ? n : null);
  return { group: id, min: GROUP_MIN, all: { on: r.all_on === 1, count: shown(r.all_n) }, first: { on: r.first_on === 1, count: shown(r.first_n) }, list: shown(r.list_n), site: r.site_n };
}
async function setLinkMembers(env, id, flag, on, now) {
  if (flag !== "all" && flag !== "first") throw bad("flag");
  if (!(await env.DB.prepare("SELECT 1 AS x FROM groups WHERE id = ?").bind(id).first())) throw new HttpError(404, "not_found");
  await env.DB.prepare("INSERT INTO group_link_flags (group_id, flag, on_, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(group_id, flag) DO UPDATE SET on_ = excluded.on_, updated_at = excluded.updated_at").bind(id, flag, on ? 1 : 0, iso(now)).run();
  return linkMembers(env, id);
}

/** מספרים מצטברים של קבוצה: נרשמו (סה"כ והיום), שמרו השערה, שמרו הצבעה — רק מ-GROUP_MIN רשומים */
async function groupStats(env, id, now) {
  const r = await env.DB.prepare(
    `WITH who AS (SELECT DISTINCT participant AS id FROM (${groupParticipants({ group: "?1" })}))
     SELECT COUNT(*) AS registered,
            SUM(CASE WHEN p.created_at >= ?2 THEN 1 ELSE 0 END) AS today,
            SUM(EXISTS(SELECT 1 FROM versions v WHERE v.participant = who.id AND v.unit = 'seats')) AS seats,
            SUM(EXISTS(SELECT 1 FROM versions v WHERE v.participant = who.id AND v.unit = 'vote')) AS vote
     FROM who JOIN participants p ON p.id = who.id`,
  ).bind(id, israelDayStart(now)).first();
  if ((r?.registered ?? 0) < GROUP_MIN) return { group: id, belowMin: true, min: GROUP_MIN };
  return { group: id, min: GROUP_MIN, registered: r.registered, today: r.today ?? 0, seats: r.seats ?? 0, vote: r.vote ?? 0 };
}

/**
 * תמונת הקבוצה למסך "ניהול קבוצה": מצב ההשערות של החברים מול טווח הסקרים, ומספר הפניות שלהם לצוות האתר.
 * רק מצטבר, ורק מ-GROUP_MIN רשומים (כמו groupStats). בלי מזהה, בלי טקסט ובלי פרט על חבר מסוים.
 * status: inRange = תקינה · approved = חריגה שאושרה · pending = ממתינה לאישור · rejected = נדחתה.
 */
export async function groupInsights(env, id, now) {
  const [who, latest, dec] = await env.DB.batch([
    env.DB.prepare(`SELECT DISTINCT participant FROM (${groupParticipants({ group: "?1" })})`).bind(id),
    env.DB.prepare(`SELECT v.id, v.participant, v.payload FROM versions v JOIN (SELECT participant, MAX(id) AS id FROM versions WHERE unit = 'seats' GROUP BY participant) m ON v.id = m.id`),
    env.DB.prepare(DECISIONS_SQL),
  ]);
  const members = new Set((who.results || []).map((r) => r.participant));
  if (members.size < GROUP_MIN) return { group: id, belowMin: true, min: GROUP_MIN };
  const decisions = new Map((dec.results || []).map((r) => [r.version_id, r.decision]));
  const status = { inRange: 0, approved: 0, pending: 0, rejected: 0 };
  const outside = new Map(LISTS_2026.map((l) => [l.id, { list: l.id, above: 0, below: 0 }]));
  for (const r of latest.results || []) {
    if (!members.has(r.participant)) continue;
    const v = { id: r.id, payload: JSON.parse(r.payload) };
    const reasons = flagReasons(v);
    const d = decisions.get(v.id);
    status[d === "rejected" ? "rejected" : !reasons.length ? "inRange" : d === "approved" ? "approved" : "pending"]++;
    // חריגה רכה: כל רשימה שההשערה מחוץ לטווח הסקרים שלה (גם בלי לעבור את סף ההמתנה)
    for (const l of LISTS_2026) {
      const x = v.payload?.seats?.[l.id]?.v ?? 0, { lo, hi } = pollRange(l.id), o = outside.get(l.id);
      if (x > hi) o.above++; else if (x < lo) o.below++;
    }
  }
  const guesses = status.inRange + status.approved + status.pending + status.rejected;
  const questions = await groupQuestions(env, [...members]);
  return { group: id, min: GROUP_MIN, asOf: iso(now), guesses, status, outside: [...outside.values()].filter((o) => o.above + o.below > 0).map((o) => ({ ...o, ...pollRange(o.list) })), questions };
}

/** כמה שעות אחורה הגרף שעתי; לפני כן — נקודה ליום (הכרעת בעלים 24.10.2026) */
export const SERIES_HOURS = 72;
/** המדדים של מסך ניהול קבוצה, לפי הסדר שקבע הבעלים. "מהרשימה" = חשבון שמייל מאומת שלו ברשימת הקבוצה */
export const SERIES_KEYS = ["list", "linkFirst", "registered", "seats", "vote", "outsideLink", "outsideFirst"];

/**
 * סדרות זמן לקבוצה: לכל מדד — סך הכול ונקודות מצטברות: שעתיות ב-72 השעות האחרונות, ויומיות (יום בשעון ישראל) לפני כן.
 * מדד שסך הכול שלו מתחת ל-GROUP_MIN מוחזר בלי נקודות ובלי מספר (כמו שאר מספרי הקבוצה), חוץ מגודל הרשימה.
 */
export async function groupSeries(env, id, now) {
  const LIST = "SELECT DISTINCT e.participant AS id FROM emails e CROSS JOIN group_members m ON m.group_id = ?1 AND m.email_hash = e.hash WHERE e.verified = 1";
  const [size, joins, reg, firstUnit, first, created] = await env.DB.batch([
    env.DB.prepare("SELECT hour, members FROM group_size_log WHERE group_id = ?1 ORDER BY hour").bind(id),
    env.DB.prepare(`SELECT j.joined_at AS t, j.participant IN (${LIST}) AS inList FROM group_link_joins j WHERE j.group_id = ?1`).bind(id),
    env.DB.prepare(`SELECT p.created_at AS t FROM (${LIST}) l JOIN participants p ON p.id = l.id`).bind(id),
    env.DB.prepare(`SELECT v.unit, MIN(v.created_at) AS t FROM (${LIST}) l JOIN versions v ON v.participant = l.id AND v.unit IN ('seats', 'vote') GROUP BY v.participant, v.unit`).bind(id),
    env.DB.prepare(`SELECT j.joined_at AS t FROM group_link_first f JOIN group_link_joins j ON j.group_id = f.group_id AND j.participant = f.participant WHERE f.group_id = ?1 AND f.participant NOT IN (${LIST})`).bind(id),
    env.DB.prepare("SELECT created_at, COALESCE((SELECT members FROM group_sizes WHERE group_id = ?1), 0) AS members FROM groups WHERE id = ?1").bind(id),
  ]);
  const g = created.results?.[0];
  if (!g) throw new HttpError(404, "not_found");
  const ts = (rows) => rows.map((r) => Date.parse(r.t)).filter(Number.isFinite);
  const J = joins.results || [], U = firstUnit.results || [];
  const events = {
    linkFirst: ts(J.filter((r) => r.inList)),
    registered: ts(reg.results || []),
    seats: ts(U.filter((r) => r.unit === "seats")),
    vote: ts(U.filter((r) => r.unit === "vote")),
    outsideLink: ts(J.filter((r) => !r.inList)),
    outsideFirst: ts(first.results || []),
  };
  const start = Math.min(Date.parse(g.created_at), ...Object.values(events).flat());
  const buckets = seriesBuckets(start, now);
  const cumulative = (list) => { const s = [...list].sort((a, b) => a - b); let i = 0; return buckets.map((b) => { while (i < s.length && s[i] < b.end) i++; return i; }); };
  // גודל הרשימה: הערך האחרון שנרשם עד סוף כל נקודה; לפני הרישום הראשון — אין ערך
  const sizes = (size.results || []).map((r) => [Date.parse(r.hour + ":00:00Z"), r.members]);
  const listPoints = buckets.map((b) => { let v = null; for (const [t, m] of sizes) if (t < b.end) v = m; return v; });
  listPoints[listPoints.length - 1] = g.members;
  const out = [{ key: "list", total: g.members, points: listPoints }];
  for (const key of SERIES_KEYS.slice(1)) {
    const total = events[key].length;
    out.push(total >= GROUP_MIN ? { key, total, points: cumulative(events[key]) } : { key, total: null, points: null });
  }
  return { group: id, min: GROUP_MIN, hours: SERIES_HOURS, buckets: buckets.map((b) => ({ t: iso(b.start), hourly: b.hourly })), series: out };
}

/** נקודות הזמן: יום (שעון ישראל) לכל יום שהסתיים לפני 72 השעות האחרונות, ואחר כך שעה לכל שעה עד עכשיו */
export function seriesBuckets(start, now) {
  const HOUR_MS = 3600_000;
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS - (SERIES_HOURS - 1) * HOUR_MS;
  const out = [];
  let t = Date.parse(israelDayStart(start));
  while (t < hourStart) {
    const next = Date.parse(israelDayStart(t + 26 * HOUR_MS));
    out.push({ start: t, end: Math.min(next, hourStart), hourly: false });
    t = next;
  }
  for (let h = hourStart; h <= now; h += HOUR_MS) out.push({ start: h, end: Math.min(h + HOUR_MS, now + 1), hourly: true });
  return out;
}

/** המשימה השעתית: גודל הרשימה של כל קבוצה לשעה הנוכחית */
async function logGroupSizes(env, now) {
  try {
    await env.DB.prepare("INSERT OR REPLACE INTO group_size_log (group_id, hour, members) SELECT g.id, ?, COALESCE((SELECT s.members FROM group_sizes s WHERE s.group_id = g.id), 0) FROM groups g").bind(iso(now).slice(0, 13)).run();
  } catch { /* הטבלה עוד לא קיימת — בפעם הבאה */ }
}

/** מספר הפניות של חברי הקבוצה לצוות האתר, לפי נושא (משרת ההערות; ספירה בלבד). null = לא זמין */
async function groupQuestions(env, participants) {
  if (!env.FEEDBACK) return null;
  try {
    const r = await env.FEEDBACK.fetch(new Request("https://feedback.internal/internal/group-questions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ participants }) }));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** הגרסה האחרונה של הגושים של כל משתתף, ומי "בבדיקה" */
async function blocsState(env) {
  const [p, b] = await env.DB.batch([
    env.DB.prepare("SELECT id, review FROM participants"),
    env.DB.prepare("SELECT v.participant, v.payload FROM versions v JOIN (SELECT participant, MAX(id) AS id FROM versions WHERE unit = 'blocs' GROUP BY participant) m ON v.id = m.id"),
  ]);
  return {
    review: new Set((p.results || []).filter((r) => r.review).map((r) => r.id)),
    latestBlocs: (b.results || []).map((r) => [r.participant, JSON.parse(r.payload)]),
  };
}

/** הקבוצות שהמשתמש מנהל — דרך מייל מאומת, כמו החברות */
async function managedGroups(env, participant) {
  const rows = (await env.DB.prepare("SELECT DISTINCT g.id, g.name_enc, l.slug, i.updated_at AS image, COALESCE((SELECT s.members FROM group_sizes s WHERE s.group_id = g.id), 0) AS members FROM groups g JOIN group_managers a ON a.group_id = g.id JOIN emails e ON e.hash = a.email_hash LEFT JOIN group_links l ON l.group_id = g.id LEFT JOIN group_images i ON i.group_id = g.id WHERE e.verified = 1 AND e.participant = ? ORDER BY g.id").bind(participant).all()).results || [];
  return Promise.all(rows.map(async (r) => ({ id: r.id, name: await open(env, r.name_enc), members: r.members, slug: r.slug ?? null, image: r.image ?? null })));
}

/** טעינת מנה של מיילים לקבוצה. create = מותר ליצור קבוצה ולשנות שם (מנהל האתר בלבד) */
async function importGroup(env, body, now, create) {
  const id = groupId(body.group);
  if (!Array.isArray(body.emails) || body.emails.length > GROUP_CHUNK) throw bad("emails");
  if (!["add", "replace"].includes(body.mode ?? "add")) throw bad("mode");
  const name = body.name === undefined ? null : normalizeName(body.name);
  if (body.name !== undefined && !name) throw bad("name");
  const exists = await env.DB.prepare("SELECT 1 AS x FROM groups WHERE id = ?").bind(id).first();
  if (!exists && (!create || !name)) throw bad("name");
  // שם הקישור באנגלית — רק בטעינה של מנהל האתר (יצירה); מנהל קבוצה משנה אותו ב-/group/link
  // בלי slug בבקשה — נגזר אוטומטית משם הקבוצה (תעתיק לאנגלית, lib/slug.js), רק בהקמה
  const given = create && body.slug !== undefined && body.slug !== null && body.slug !== "";
  let slug = given ? slugOf(body.slug) : null;
  if (slug) await ensureSlugFree(env, id, slug);
  else if (create && !exists) slug = await autoSlug(env, name);
  const hashes = new Set();
  const hash = await emailHasher(env);
  let invalid = 0, valid = 0;
  for (const raw of body.emails) {
    const e = normalizeEmail(raw);
    if (e) { valid++; hashes.add(await hash(e.norm)); }
    else invalid++;
  }
  const before = await groupSize(env, id);
  const stmts = [];
  if (!exists) stmts.push(env.DB.prepare("INSERT INTO groups (id, name_enc, created_at) VALUES (?, ?, ?)").bind(id, await seal(env, name), iso(now)));
  else if (name) stmts.push(env.DB.prepare("UPDATE groups SET name_enc = ? WHERE id = ?").bind(await seal(env, name), id));
  if (slug) stmts.push(upsertSlug(env, id, slug));
  if (body.mode === "replace") stmts.push(env.DB.prepare("DELETE FROM group_members WHERE group_id = ?").bind(id));
  for (const h of hashes) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO group_members (group_id, email_hash) VALUES (?, ?)").bind(id, h));
  if (stmts.length) await env.DB.batch(stmts);
  const members = await groupSize(env, id);
  const base = body.mode === "replace" ? 0 : before;
  return { group: id, added: members - base, duplicates: valid - (members - base), invalid, members };
}

/**
 * העלאת רשימה בשלבים (הכרעת בעלים 24.10.2026): כל הקובץ נשמר מיד בשרת — מוצפן, בחלקים של UPLOAD_PART —
 * ואז כל חלק מעובד בנפרד (גיבוב והוספה לרשימה) ונמחק. כך העלאה אינה נכשלת בגלל עומס, והעיבוד ממשיך גם אם הדף נסגר
 * (המשימה השעתית משלימה). אחרי העיבוד נשארת רק "טביעת האצבע" של כל מייל.
 */
export const UPLOAD_MAX = 2000;
export const UPLOAD_PART = 200;
async function createUpload(env, id, body, now) {
  if (!Array.isArray(body.emails) || body.emails.length > UPLOAD_MAX || body.emails.some((e) => typeof e !== "string" || e.length > 320)) throw bad("emails");
  const mode = body.mode ?? "add";
  if (!["add", "replace"].includes(mode)) throw bad("mode");
  await requireGroup(env, id);
  const before = await groupSize(env, id);
  const up = await env.DB.prepare("INSERT INTO group_uploads (group_id, mode, total, base, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id").bind(id, mode, body.emails.length, mode === "replace" ? 0 : before, iso(now)).first();
  const stmts = mode === "replace" ? [env.DB.prepare("DELETE FROM group_members WHERE group_id = ?").bind(id)] : [];
  for (let i = 0; i < body.emails.length; i += UPLOAD_PART)
    stmts.push(env.DB.prepare("INSERT INTO group_upload_parts (upload_id, idx, data_enc) VALUES (?, ?, ?)").bind(up.id, i / UPLOAD_PART, await seal(env, JSON.stringify(body.emails.slice(i, i + UPLOAD_PART)))));
  if (stmts.length) await env.DB.batch(stmts);
  return processUpload(env, id, up.id);
}
/** עיבוד החלק הבא של העלאה (אחד בכל קריאה) — מחזיר את המצב */
async function processUpload(env, id, uploadId) {
  const up = await env.DB.prepare("SELECT * FROM group_uploads WHERE id = ? AND group_id = ?").bind(uploadId, id).first();
  if (!up) throw new HttpError(404, "not_found");
  const part = await env.DB.prepare("SELECT idx, data_enc FROM group_upload_parts WHERE upload_id = ? ORDER BY idx LIMIT 1").bind(uploadId).first();
  if (part) {
    const emails = JSON.parse(await open(env, part.data_enc));
    const hash = await emailHasher(env);
    const hashes = new Set();
    let invalid = 0;
    for (const raw of emails) {
      const e = normalizeEmail(raw);
      if (e) hashes.add(await hash(e.norm)); else invalid++;
    }
    const stmts = [...hashes].map((h) => env.DB.prepare("INSERT OR IGNORE INTO group_members (group_id, email_hash) VALUES (?, ?)").bind(id, h));
    stmts.push(env.DB.prepare("UPDATE group_uploads SET done = done + ?, invalid = invalid + ? WHERE id = ?").bind(emails.length, invalid, uploadId));
    stmts.push(env.DB.prepare("DELETE FROM group_upload_parts WHERE upload_id = ? AND idx = ?").bind(uploadId, part.idx));
    await env.DB.batch(stmts);
  }
  const left = (await env.DB.prepare("SELECT COUNT(*) AS n FROM group_upload_parts WHERE upload_id = ?").bind(uploadId).first()).n;
  const cur = await env.DB.prepare("SELECT total, done, invalid, base FROM group_uploads WHERE id = ?").bind(uploadId).first();
  const members = await groupSize(env, id);
  if (!left) await env.DB.prepare("DELETE FROM group_uploads WHERE id = ?").bind(uploadId).run();
  return { group: id, upload: uploadId, total: cur.total, done: cur.done, invalid: cur.invalid, added: Math.max(0, members - cur.base), members, finished: !left };
}
/** המשימה השעתית: משלימה העלאות שהדף שלהן נסגר באמצע */
async function finishUploads(env, maxParts = 50) {
  for (let i = 0; i < maxParts; i++) {
    const row = await env.DB.prepare("SELECT u.id, u.group_id FROM group_uploads u WHERE EXISTS (SELECT 1 FROM group_upload_parts p WHERE p.upload_id = u.id) ORDER BY u.id LIMIT 1").first();
    if (!row) break;
    await processUpload(env, row.group_id, row.id);
  }
  // העלאה בלי חלקים שנותרה (נקטעה בין השלבים) — נמחקת
  await env.DB.prepare("DELETE FROM group_uploads WHERE NOT EXISTS (SELECT 1 FROM group_upload_parts p WHERE p.upload_id = group_uploads.id)").run();
}

/** שם הקישור באנגלית: אותיות לטיניות קטנות, ספרות ומקף באמצע; 3–32 תווים */
const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
function slugOf(v) {
  if (typeof v !== "string" || !SLUG.test(v)) throw bad("slug");
  return v;
}
async function ensureSlugFree(env, id, slug) {
  const taken = await env.DB.prepare("SELECT group_id FROM group_links WHERE slug = ?").bind(slug).first();
  if (taken && taken.group_id !== id) throw new HttpError(409, "slug_taken");
}
const upsertSlug = (env, id, slug) =>
  env.DB.prepare("INSERT INTO group_links (group_id, slug) VALUES (?, ?) ON CONFLICT(group_id) DO UPDATE SET slug = excluded.slug").bind(id, slug);

async function requireGroup(env, id) {
  if (!(await env.DB.prepare("SELECT 1 AS x FROM groups WHERE id = ?").bind(id).first())) throw new HttpError(404, "not_found");
}

/** שם קישור פנוי שנגזר משם הקבוצה; null אם אי אפשר לגזור (שם בלי אותיות וספרות) */
async function autoSlug(env, name, exceptGroup = null) {
  const base = slugFromName(name);
  if (!base) return null;
  return freeSlug(base, async (x) => {
    const row = await env.DB.prepare("SELECT group_id FROM group_links WHERE slug = ?").bind(x).first();
    return !!row && row.group_id !== exceptGroup;
  });
}

/** קביעת שם הקישור של קבוצה קיימת (מנהל האתר, או מנהל הקבוצה שלה). בלי slug בבקשה — נגזר משם הקבוצה */
async function setGroupSlug(env, body) {
  const id = groupId(body.group);
  await requireGroup(env, id);
  let slug;
  if (body.slug === undefined) {
    const g = await env.DB.prepare("SELECT name_enc FROM groups WHERE id = ?").bind(id).first();
    slug = await autoSlug(env, await open(env, g.name_enc), id);
    if (!slug) throw bad("slug");
  } else slug = slugOf(body.slug);
  await ensureSlugFree(env, id, slug);
  await upsertSlug(env, id, slug).run();
  return { group: id, slug };
}

/** כניסות דרך הקישור: בסך הכול, היום, ודפדפנים שונים (כניסה ראשונה של דפדפן). מונה אנונימי — בלי סף מינימום */
async function linkStats(env, id, now) {
  const slug = (await env.DB.prepare("SELECT slug FROM group_links WHERE group_id = ?").bind(id).first())?.slug ?? null;
  const t = await env.DB.prepare("SELECT COALESCE(SUM(opens), 0) AS opens, COALESCE(SUM(fresh), 0) AS fresh, COALESCE(SUM(CASE WHEN day = ? THEN opens ELSE 0 END), 0) AS today FROM group_visits WHERE group_id = ?").bind(ilDay(now), id).first();
  return { group: id, slug, opens: t.opens, today: t.today, fresh: t.fresh };
}

const IMAGE_TYPES = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};
/** תמונה מ-data URL: סוג מותר (בלי SVG), חתימת הקובץ תואמת, וגודל עד IMAGE_MAX */
function parseImage(v) {
  const m = typeof v === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(v) : null;
  if (!m) throw bad("image");
  let bytes;
  try { bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)); } catch { throw bad("image"); }
  if (bytes.length < 16 || bytes.length > IMAGE_MAX || !IMAGE_TYPES[m[1]](bytes)) throw bad("image");
  return { mime: m[1], data: m[2] };
}

/** החלפה או הסרה של תמונת הקבוצה (מנהל האתר, או מנהל הקבוצה שלה) */
async function setGroupImage(env, body, now) {
  const id = groupId(body.group);
  await requireGroup(env, id);
  if (body.remove === true) await env.DB.prepare("DELETE FROM group_images WHERE group_id = ?").bind(id).run();
  else {
    const { mime, data } = parseImage(body.image);
    await env.DB.prepare("INSERT INTO group_images (group_id, mime, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(group_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at").bind(id, mime, data, iso(now)).run();
  }
  const image = (await env.DB.prepare("SELECT updated_at FROM group_images WHERE group_id = ?").bind(id).first())?.updated_at ?? null;
  return { group: id, image };
}

/** מנהל הקבוצה המחובר — מחזיר את מזהה הקבוצה */
async function requireManager(env, request, now, raw) {
  const { participant } = await requireAuth(env, request, now);
  const id = groupId(raw);
  if (!(await managedGroups(env, participant)).some((g) => g.id === id)) throw new HttpError(403, "not_manager");
  return id;
}

/** הגבלת קצב לנתיבים הציבוריים של הקישור (לפי IP) */
async function limitGroupPublic(env, request, now) {
  const [cur] = await ipKeys(env, request);
  if (!(await hit(env, "gp:" + cur, 240, now))) throw new HttpError(429, "rate");
}

/** מזהה קבוצה: אותיות לטיניות קטנות, ספרות ומקף */
const GROUP_ID = /^[a-z0-9-]{2,32}$/;
/** מיילים בבקשה אחת — כדי להישאר מתחת ל-MAX_BODY; רשימה גדולה נשלחת במנות */
export const GROUP_CHUNK = 300;
/**
 * חברי הקבוצה לצורך ספירה והצלבה: מי שברשימת המיילים, וגם מנהלי הקבוצה (הכרעת בעלים 12.10.2026) — מנהל שנרשם ואימת מייל נספר בקבוצה
 * גם אם אינו ברשימה, ורואה את מסך הקבוצה. אותו מייל ברשימה ובמנהלים נספר פעם אחת (UNION).
 * חברי קבוצה לפי חשבון: מייל מאומת ברשימה או של מנהל, ומי שנכנס דרך הקישור — רק כשהמנהל הפעיל זאת (הכרעת בעלים 23.10.2026).
 * החיפוש מתחיל מהמיילים המאומתים (CROSS JOIN קובע את הסדר) ומחפש כל אחד באינדקס של הרשימות — בלי לעבור על כל הרשימות
 * (הכרעת בעלים 24.10.2026). participant / group = מקום הפרמטר בשאילתה ("?1"), לסינון למשתמש אחד או לקבוצה אחת. */
export function groupParticipants({ participant, group } = {}) {
  const who = (col) => (participant ? ` AND ${col} = ${participant}` : "");
  const grp = (col) => (group ? ` AND ${col} = ${group}` : "");
  return `SELECT m.group_id, e.participant FROM emails e CROSS JOIN group_members m ON m.email_hash = e.hash${grp("m.group_id")} WHERE e.verified = 1${who("e.participant")}
  UNION SELECT a.group_id, e.participant FROM emails e CROSS JOIN group_managers a ON a.email_hash = e.hash${grp("a.group_id")} WHERE e.verified = 1${who("e.participant")}
  UNION SELECT j.group_id, j.participant FROM group_link_joins j JOIN group_link_flags f ON f.group_id = j.group_id AND f.flag = 'all' AND f.on_ = 1 WHERE 1${who("j.participant")}${grp("j.group_id")}
  UNION SELECT j.group_id, j.participant FROM group_link_first j JOIN group_link_flags f ON f.group_id = j.group_id AND f.flag = 'first' AND f.on_ = 1 WHERE 1${who("j.participant")}${grp("j.group_id")}`;
}
/** מספר המיילים ברשימת הקבוצה — מהמונה המוכן (group_sizes, מתעדכן בטריגר), בלי לספור את הרשימה */
async function groupSize(env, id) {
  return (await env.DB.prepare("SELECT members FROM group_sizes WHERE group_id = ?").bind(id).first())?.members ?? 0;
}
/** סף מינימום להצגת נתוני קבוצה (הכרעת בעלים 11.10.2026) */
export const GROUP_MIN = 50;
function groupId(v) {
  if (typeof v !== "string" || !GROUP_ID.test(v)) throw bad("group");
  return v;
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
/**
 * החלטות לבדיקת חריגות: ידניות (version_review) ואישור אוטומטי (version_accepted, הכרעת בעלים 12.10.2026):
 * השערה שנמצאה תקינה — בשמירה או כשנכנסה לטווח — מאושרת לצמיתות ולא חוזרת להמתנה, גם אם טווח הסקרים זז.
 */
const DECISIONS_SQL = "SELECT version_id, decision FROM version_review UNION ALL SELECT a.version_id, 'approved' AS decision FROM version_accepted a WHERE a.version_id NOT IN (SELECT version_id FROM version_review)";

async function loadDecisions(env) {
  const { results } = await env.DB.prepare(DECISIONS_SQL).all();
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
    // סיסמה חדשה מנתקת גם את העוזרים המחוברים (אותו כלל כמו כל מכשיר אחר)
    env.DB.prepare("UPDATE agent_sessions SET revoked = 1 WHERE participant = ?").bind(participant),
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
    env.DB.prepare(DECISIONS_SQL),
    env.DB.prepare("SELECT v.participant, v.payload FROM versions v JOIN (SELECT participant, MAX(id) AS id FROM versions WHERE unit = 'blocs' GROUP BY participant) m ON v.id = m.id"),
    env.DB.prepare("SELECT version_id FROM version_review WHERE decision = 'approved'"),
  ]);
  const blocsBy = new Map((data[3].results || []).map((r) => [r.participant, JSON.parse(r.payload)]));
  const review = new Set((data[0].results || []).filter((p) => p.review).map((p) => p.id));
  const known = new Set((data[0].results || []).map((p) => p.id));
  const verified = new Set((data[0].results || []).filter((p) => p.verified).map((p) => p.id));
  const latest = (data[1].results || []).filter((r) => known.has(r.participant)).map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  const decisions = new Map((data[2].results || []).map((r) => [r.version_id, r.decision]));
  // הבדיקה מול כל המשתתפים שנספרים (לא "בבדיקה"); מאומתים ולא מאומתים נספרים באותה צורה
  const counted = latest.filter((v) => !review.has(v.participant));
  // הסיבות לחריגה גם להשערות שכבר הוכרעו (לתצוגה בלבד)
  const raw = moderate(counted, new Map()).pending;
  // השערה ממתינה שנכנסה לטווח, או תקינה שעוד לא סומנה ⇐ מאושרת אוטומטית, לצמיתות (הכרעת בעלים 12.10.2026)
  const fresh = counted.filter((v) => !decisions.has(v.id) && !raw.has(v.id)).map((v) => v.id);
  if (fresh.length) {
    await env.DB.batch(fresh.map((id) => env.DB.prepare("INSERT OR IGNORE INTO version_accepted (version_id, accepted_at) VALUES (?, ?)").bind(id, iso(clock(env)))));
    for (const id of fresh) decisions.set(id, "approved");
  }
  // "אושרה" בתצוגה = אישור ידני; אישור אוטומטי מוצג כ"תקינה"
  const manual = new Set((data[4].results || []).map((r) => r.version_id));
  const mod = moderate(counted, decisions);
  return { latest, review, verified, blocsBy, mod: { ...mod, decisions, raw, manual } };
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
  "POST /migration/create": async ({ env, request, now, body }) => {
    if (request.headers.get("origin") !== "https://hopetohelp.github.io") throw new HttpError(403, "origin");
    const [ip] = await ipKeys(env, request);
    // סינון כמו נטפרי עשוי לשתף כתובת IP בין גולשים רבים; הגבול כאן מגן רק מפני הצפה חריגה.
    if (!(await hit(env, "migration:create:" + ip, 1000, now))) throw new HttpError(429, "rate");
    if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 60 || JSON.stringify(body.entries).length > 200_000) throw bad("entries");
    const seen = new Set();
    for (const item of body.entries) {
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" || typeof item[1] !== "string" || !LEGACY_KEY.test(item[0]) || seen.has(item[0])) throw bad("entries");
      seen.add(item[0]);
    }
    let next;
    try { next = new URL(body.next); } catch { throw bad("next"); }
    if (next.origin !== "https://26.hopetohelp.net" || next.username || next.password) throw bad("next");
    const ticket = randomToken();
    await env.DB.prepare("INSERT INTO legacy_handoffs (ticket_hash, payload_enc, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(ticket), await seal(env, JSON.stringify({ entries: body.entries, next: next.href })), iso(now + HANDOFF_TTL)).run();
    return { ticket };
  },
  "POST /migration/read": async ({ env, request, now, body }) => {
    if (request.headers.get("origin") !== "https://26.hopetohelp.net") throw new HttpError(403, "origin");
    if (typeof body.ticket !== "string" || !/^[\w-]{43}$/.test(body.ticket)) throw bad("ticket");
    const row = await env.DB.prepare("SELECT payload_enc FROM legacy_handoffs WHERE ticket_hash = ? AND expires_at > ? AND completed_at IS NULL")
      .bind(await sha256(body.ticket), iso(now)).first();
    if (!row?.payload_enc) throw new HttpError(410, "handoff_expired");
    const value = await open(env, row.payload_enc);
    if (!value) throw new HttpError(500, "handoff_unavailable");
    return JSON.parse(value);
  },
  "POST /migration/finish": async ({ env, request, now, body }) => {
    if (request.headers.get("origin") !== "https://26.hopetohelp.net") throw new HttpError(403, "origin");
    if (typeof body.ticket !== "string" || !/^[\w-]{43}$/.test(body.ticket)) throw bad("ticket");
    const result = await env.DB.prepare("UPDATE legacy_handoffs SET payload_enc = NULL, completed_at = ?, expires_at = ? WHERE ticket_hash = ? AND expires_at > ? AND completed_at IS NULL")
      .bind(iso(now), iso(now + HANDOFF_RECEIPT_TTL), await sha256(body.ticket), iso(now)).run();
    if (!result.meta?.changes) {
      const existing = await env.DB.prepare("SELECT completed_at FROM legacy_handoffs WHERE ticket_hash = ? AND expires_at > ?")
        .bind(await sha256(body.ticket), iso(now)).first();
      if (!existing?.completed_at) throw new HttpError(410, "handoff_expired");
    }
    return { ok: true };
  },
  "POST /migration/status": async ({ env, request, now, body }) => {
    if (request.headers.get("origin") !== "https://hopetohelp.github.io") throw new HttpError(403, "origin");
    if (typeof body.ticket !== "string" || !/^[\w-]{43}$/.test(body.ticket)) throw bad("ticket");
    const row = await env.DB.prepare("SELECT completed_at FROM legacy_handoffs WHERE ticket_hash = ? AND expires_at > ?")
      .bind(await sha256(body.ticket), iso(now)).first();
    return { complete: !!row?.completed_at };
  },
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
    const sourcePref = await env.DB.prepare("SELECT value FROM data_source_prefs WHERE participant = ?").bind(participant).first();
    const dataSource = sourcePref?.value ? JSON.parse(sourcePref.value) : null;
    // ההשערה האחרונה ממתינה לאישור מנהל (חריגה) — הגולש רואה אותה כרגיל, עם הסבר
    const seatsPending = latest.seats ? (await dashboardState(env)).pending.has(latest.seats.id) : false;
    const consent = await env.DB.prepare("SELECT version FROM privacy_consents WHERE participant = ?").bind(participant).first();
    return {
      participant: p.id, created_at: p.created_at, latest, username: pw?.username ?? null, google: !!g, guest: !pw && !g, prefs: { camps, lineage, dataSource }, seatsPending,
      emails, name: prof ? await open(env, prof.name_enc) : null, hasPassword: !!pw,
      // גרסת נוסח הפרטיות שהמשתמש אישר (null = טרם אישר) — האתר מבקש אישור כשהגרסה הנוכחית חדשה יותר
      privacy: consent?.version ?? null,
      // חשבון בלי מייל ובלי Google (אורח או שם משתמש ישן) — נדרש להוסיף בכניסה הבאה (הכרעת בעלים 9.10.2026)
      needsEmail: !emails.length && !g,
      // אימות מייל במייל: זמין כשמוגדר מפתח Firebase
      verifyAvailable: !!env.FIREBASE_API_KEY,
      isAdmin: !!(await env.DB.prepare("SELECT 1 AS x FROM admins WHERE participant = ?").bind(participant).first()),
      // נספר בסטטיסטיקות רק חשבון מאומת: Google או מייל שאומת
      verified: !!g || emailRows.some((r) => r.verified),
      // הקבוצות של המשתמש (לכפתור ההחלפה) — רק דרך מייל מאומת; גולש אחר לא רואה שקיימות קבוצות
      groups: await myGroups(env, participant),
      // הקבוצות שהמשתמש מנהל (למסך העלאת הרשימה), עם מספר המיילים ברשימה
      managedGroups: (await managedGroups(env, participant)).map(({ id, name, slug, image, members }) => ({ id, name, slug, image, members })),
      // חשבון ישן (קישור אישי, שם משתמש או אורח) שעוד לא אומת — נדרש לאמת מייל או לחבר Google מיד בכניסה (הכרעת בעלים 10.10.2026)
      legacy: !!hasLink || !!pw?.username || (!pw && !g),
    };
  },

  // העדפות אישיות (המחנות) — נשמרות על המשתמש, בלי גרסאות ובלי השפעה על הסטטיסטיקות
  "POST /prefs": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    // camps (המחנות, הגרסה הקודמת) ו/או lineage (השיוך האישי) — לפחות אחד
    if (body.camps === undefined && body.lineage === undefined && body.dataSource === undefined) throw bad("invalid", { field: "prefs" });
    const dataSource = body.dataSource === undefined ? null : cleanDataPreference(body.dataSource);
    if (body.dataSource !== undefined && (!dataSource || Date.parse(dataSource.updatedAt) > now + 60_000)) throw bad("invalid", { field: "dataSource" });
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
    if (dataSource) await env.DB.prepare("INSERT INTO data_source_prefs (participant, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE excluded.updated_at > data_source_prefs.updated_at")
      .bind(participant, JSON.stringify(dataSource), dataSource.updatedAt).run();
    const savedSource = dataSource ? await env.DB.prepare("SELECT value FROM data_source_prefs WHERE participant = ?").bind(participant).first() : null;
    return { ok: true, ...(savedSource ? { dataSource: JSON.parse(savedSource.value) } : {}), ...(c ? { camps: c.value } : {}), ...(l ? { lineage: l.value } : {}) };
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
    // השערת מנדטים תקינה בשמירה ⇐ מאושרת אוטומטית לצמיתות (לא תחזור להמתנה אם טווח הסקרים יזוז)
    if (unit === "seats" && !flagReasons(parseVersion(saved)).length)
      await env.DB.prepare("INSERT OR IGNORE INTO version_accepted (version_id, accepted_at) VALUES (?, ?)").bind(saved.id, iso(now)).run();
    // כלל קבוע (הכרעת בעלים 10.10.2026): בכל יחידה נשמרת ההשערה האחרונה של כל יום (שעון ישראל); גרסאות קודמות מאותו יום נמחקות.
    // "מצב בסוף יום" (מגמות) אינו משתנה, כי האחרונה היא מצב סוף היום.
    const { results: earlier } = await env.DB.prepare("SELECT id, created_at FROM versions WHERE participant = ? AND unit = ? AND id < ?").bind(participant, unit, saved.id).all();
    const sameDay = (earlier || []).filter((v) => ilDay(v.created_at) === ilDay(saved.created_at)).map((v) => v.id);
    if (sameDay.length) {
      const marks = sameDay.map(() => "?").join(",");
      await env.DB.batch([
        env.DB.prepare("INSERT INTO participant_activity (participant, pruned) VALUES (?, ?) ON CONFLICT(participant) DO UPDATE SET pruned = pruned + excluded.pruned").bind(participant, sameDay.length),
        env.DB.prepare(`DELETE FROM version_review WHERE version_id IN (${marks})`).bind(...sameDay),
        env.DB.prepare(`DELETE FROM version_accepted WHERE version_id IN (${marks})`).bind(...sameDay),
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
      env.DB.prepare("DELETE FROM version_accepted WHERE version_id IN (SELECT id FROM versions WHERE participant = ?)").bind(participant),
      env.DB.prepare("DELETE FROM bloc_migration_backup WHERE kind = 'version' AND id IN (SELECT id FROM versions WHERE participant = ?)").bind(participant),
      env.DB.prepare("DELETE FROM versions WHERE participant = ?").bind(participant),
      env.DB.prepare("UPDATE participant_activity SET pruned = 0 WHERE participant = ?").bind(participant),
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
      dataSource: (await env.DB.prepare("SELECT value, updated_at FROM data_source_prefs WHERE participant = ?").bind(participant).first()) ?? null,
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
      env.DB.prepare("DELETE FROM version_accepted WHERE version_id IN (SELECT id FROM versions WHERE participant = ?)").bind(participant),
        env.DB.prepare("DELETE FROM bloc_migration_backup WHERE kind = 'version' AND id IN (SELECT id FROM versions WHERE participant = ?)").bind(participant),
      ]
        .concat(
          ["versions", "participant_activity", "credentials", "sessions", "agent_sessions", "prefs", "lineage_prefs", "data_source_prefs", "privacy_consents", "emails", "profile", "email_verify", "password_reset", "password_reset_email", "admins", "support_messages", "support_threads"].map((t) =>
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
  // אישור נוסח הפרטיות (הכרעת בעלים 24.10.2026): נשמרת הגרסה והמועד בלבד. מהדפדפן בלבד — לא דרך עוזר AI.
  "POST /account/privacy": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const version = body.version;
    if (!Number.isInteger(version) || version < 1 || version > 1000) throw bad("version");
    await env.DB.prepare("INSERT INTO privacy_consents (participant, version, accepted_at) VALUES (?, ?, ?) ON CONFLICT(participant) DO UPDATE SET version = excluded.version, accepted_at = excluded.accepted_at WHERE excluded.version >= privacy_consents.version")
      .bind(participant, version, iso(now)).run();
    return { privacy: (await env.DB.prepare("SELECT version FROM privacy_consents WHERE participant = ?").bind(participant).first())?.version ?? null };
  },

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
      await fb.sendVerify(env, idToken, `${returnSiteUrl(env, request.headers.get("origin"))}#/support`);
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

  // חיבור עוזר AI (מסך "חיבור עוזר AI" באתר): כניסה נפרדת לעוזר, רק מתוך סשן דפדפן. האסימון חוזר פעם אחת ולא נשמר.
  "POST /auth/delegate": async ({ env, request, now, body }) => {
    const a = await requireAuth(env, request, now);
    if (a.agent) throw new HttpError(403, "assistant_not_allowed");
    const active = (await env.DB.prepare("SELECT COUNT(*) AS n FROM agent_sessions WHERE participant = ? AND revoked = 0 AND expires_at > ?").bind(a.participant, iso(now)).first()).n;
    if (active >= MAX_AGENTS) throw new HttpError(409, "too_many_connections");
    const token = randomToken();
    await env.DB.prepare("INSERT INTO agent_sessions (token_hash, participant, client, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(token), a.participant, clientLabel(body.client), iso(now), iso(now + AGENT_SESSION_MS)).run();
    return { token, expiresAt: iso(now + AGENT_SESSION_MS) };
  },

  // "החיבורים שלי": העוזרים המחוברים לחשבון (בלי האסימונים)
  "GET /account/connections": async ({ env, request, now }) => {
    const a = await requireAuth(env, request, now);
    const { results } = await env.DB.prepare("SELECT token_hash, client, created_at, last_used_at, expires_at FROM agent_sessions WHERE participant = ? AND revoked = 0 AND expires_at > ? ORDER BY created_at DESC")
      .bind(a.participant, iso(now)).all();
    return { connections: (results || []).map((r) => ({ id: connectionId(r.token_hash), client: r.client, createdAt: r.created_at, lastUsedAt: r.last_used_at, expiresAt: r.expires_at })) };
  },

  // ניתוק עוזר (או כולם). העוזר מקבל מיד 401, וצריך להתחבר מחדש.
  "POST /account/connections/revoke": async ({ env, request, now, body }) => {
    const a = await requireAuth(env, request, now);
    if (a.agent) throw new HttpError(403, "assistant_not_allowed");
    if (body.all === true) await env.DB.prepare("UPDATE agent_sessions SET revoked = 1 WHERE participant = ?").bind(a.participant).run();
    else {
      if (typeof body.id !== "string" || !/^[0-9a-f]{16}$/.test(body.id)) throw bad("id");
      await env.DB.prepare("UPDATE agent_sessions SET revoked = 1 WHERE participant = ? AND substr(token_hash, 1, 16) = ?").bind(a.participant, body.id).run();
    }
    return { ok: true };
  },

  "POST /auth/logout": async ({ env, request, now, body }) => {
    const a = await requireAuth(env, request, now);
    if (body.all) await env.DB.batch([
      env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE participant = ?").bind(a.participant),
      env.DB.prepare("UPDATE agent_sessions SET revoked = 1 WHERE participant = ?").bind(a.participant),
    ]);
    else await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE token_hash = ?").bind(a.session).run();
    return { ok: true };
  },

  // שינוי סיסמה בסשן רגיל — חובה הסיסמה הנוכחית. כל הסשנים האחרים מבוטלים; הקישור האישי נשאר.
  "POST /auth/password": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const cred = await passwordCred(env, participant);
    if (!cred) throw bad("no_password");
    // מפתח העיכוב לחשבון הזה בלבד: בחשבון מייל username_norm ריק, ובלי המזהה כל חשבונות המייל היו חולקים מפתח אחד ("user|null")
    const keys = ["fa:" + (await hmac(env.IP_KEY, cred.username_norm ? "user|" + cred.username_norm : "participant|" + participant))];
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
      await fb.sendVerify(env, idToken, `${returnSiteUrl(env, request.headers.get("origin"))}?reset=${secret}`, { strict: true });
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
    const participants = await accountCount(env.DB);
    const stats = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM participants WHERE created_at >= date('now')) AS participantsToday, (SELECT COUNT(DISTINCT participant) FROM versions) AS savers, (SELECT COUNT(DISTINCT participant) FROM versions WHERE created_at >= date('now')) AS saversToday, (SELECT COUNT(*) FROM versions WHERE created_at >= date('now')) AS savesToday, (SELECT COUNT(*) FROM participants p WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.participant = p.id) AND EXISTS (SELECT 1 FROM credentials c WHERE c.participant = p.id AND c.kind = 'password')) AS accountsNoSave, (SELECT COUNT(*) FROM participants p WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.participant = p.id) AND NOT EXISTS (SELECT 1 FROM credentials c WHERE c.participant = p.id)) AS emptyGuests, (SELECT COUNT(DISTINCT participant) FROM emails WHERE verified = 1 AND source <> 'google') AS verifiedEmails, (SELECT COUNT(DISTINCT participant) FROM credentials WHERE kind = 'google') AS googleAccounts").first();
    return { stats: { ...stats, participants }, threads: (threads || []).map((t) => ({ ...t, messages: (msgs || []).filter((m) => m.participant === t.participant).map(({ participant: _p, ...m }) => m) })) };
  },
  // הגדרת חשבון מנהל בקישור חד-פעמי (הכרעת בעלים 13.10.2026): הסשן הפתוח בדפדפן הוא החשבון שהופך למנהל. הקוד נמחק בשימוש הראשון ופג תוקף.
  "POST /admin/claim": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const [cur] = await ipKeys(env, request);
    if (!(await hit(env, "ac:" + cur, 10, now))) throw new HttpError(429, "rate");
    const code = typeof body.code === "string" ? body.code : "";
    if (!/^[\w-]{32,100}$/.test(code)) throw bad("code");
    const used = await env.DB.prepare("DELETE FROM admin_claims WHERE hash = ? AND expires_at > ? RETURNING hash").bind(await sha256(code), iso(now)).first();
    if (!used) throw new HttpError(403, "invalid_code");
    await env.DB.prepare("INSERT OR IGNORE INTO admins (participant, added_at) VALUES (?, ?)").bind(participant, iso(now)).run();
    return { ok: true };
  },
  // שרת ההערות בודק כאן אם הסשן או המפתח שקיבל שייכים למנהל (חשבון מנהל נכנס לממשק הניהול בלי קישור)
  "GET /admin/whoami": async ({ env, request, now }) => {
    await requireAdmin(env, request);
    // כניסת עוזר AI של מנהל ⇐ agent = שם העוזר: שרת ההערות מגביל אותה לפעולות השיחה שהבעלים התיר
    const agent = await agentSession(env, requestToken(request), now);
    return { ok: true, ...(agent ? { agent: agent.client } : {}) };
  },
  // דשבורד השערות למנהל (הכרעת בעלים 9.10.2026): כל ההשערות, בלי שום מזהה — בלי מזהה משתתף, גרסה או פעולה; מועד ההשערה ביום בלבד (ופעילות המשתתף — הרשמה, כניסות ושמירות — נוספה ב-10.10.2026),
  // בסדר אקראי בכל טעינה. לכל השערה "ידית" חד-פעמית (HMAC עם מלח אקראי של הטעינה) שמשמשת רק לאישור או לדחייה.
  "GET /admin/guesses": async ({ env, request }) => {
    await requireAdmin(env, request);
    const { latest, mod, review, verified, blocsBy } = await moderationState(env);
    // פעילות לכל משתתף (הכרעת בעלים 10.10.2026): הצבעה שמורה, סך שמירות, מועד הרשמה, כניסה אחרונה ומספר כניסות. בלי מזהה בתשובה.
    const { results: act } = await env.DB.prepare(
      "SELECT p.id, p.created_at AS registered, EXISTS(SELECT 1 FROM versions v WHERE v.participant = p.id AND v.unit = 'vote') AS has_vote, (SELECT COUNT(*) FROM versions v WHERE v.participant = p.id) + COALESCE(a.pruned, 0) AS saves, COALESCE(a.logins, 0) + (SELECT COUNT(*) FROM sessions s WHERE s.participant = p.id) AS logins, MAX(COALESCE((SELECT MAX(s.created_at) FROM sessions s WHERE s.participant = p.id), ''), COALESCE(a.last_login_at, '')) AS last_login FROM participants p LEFT JOIN participant_activity a ON a.participant = p.id",
    ).all();
    const activity = new Map((act || []).map((r) => [r.id, r]));
    const salt = randomToken(12);
    const rows = [];
    for (const v of latest) {
      const reasons = mod.pending.get(v.id) ?? [];
      const decision = mod.decisions.get(v.id) ?? null;
      const shown = decision === "approved" && !mod.manual.has(v.id) ? "ok" : decision;
      const status = review.has(v.participant) ? "review" : shown ?? (reasons.length ? "pending" : "ok");
      rows.push({
        handle: (await hmac(env.IP_KEY, `guess|${salt}|${v.id}`)).slice(0, 32),
        day: v.created_at.slice(0, 10),
        savedAt: v.created_at,
        mode: v.payload.mode === "pct" ? "pct" : "seats",
        seats: Object.fromEntries(Object.entries(v.payload.seats || {}).map(([id, c]) => [id, c?.v ?? 0])),
        ...(v.payload.mode === "pct" && v.payload.pct ? { pct: v.payload.pct } : {}),
        status,
        verified: verified.has(v.participant),
        reasons: reasons.length ? reasons : mod.raw.get(v.id) ?? [],
        blocs: blocsOf(v.payload, blocsBy.get(v.participant) ?? null),
        hasVote: !!activity.get(v.participant)?.has_vote,
        saves: activity.get(v.participant)?.saves ?? 0,
        registered: activity.get(v.participant)?.registered ?? null,
        lastLogin: activity.get(v.participant)?.last_login || null,
        logins: activity.get(v.participant)?.logins ?? 0,
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

  // כל הגושים שהמשתתפים הגדירו (הכרעת בעלים 12.10.2026): לכל הרכב — כמה משתתפים, ואילו שמות נתנו לו (וכמה פעמים כל שם). בלי מזהים.
  // לפי הגרסה האחרונה של הגושים של כל משתתף שנספר (בלי "בבדיקה").
  "GET /admin/blocs": async ({ env, request }) => {
    await requireAdmin(env, request);
    const { latestBlocs, review } = await blocsState(env);
    const by = new Map();
    for (const [participant, payload] of latestBlocs) {
      if (review.has(participant) || payload?.mode !== "custom") continue;
      const seen = new Set();
      for (const b of migrateBlocs(payload).blocs ?? []) {
        if (!b.lists?.length) continue;
        const key = compositionKey(b.lists);
        if (seen.has(key)) continue;
        seen.add(key);
        const e = by.get(key) ?? by.set(key, { lists: [...new Set(b.lists)].sort(), n: 0, names: new Map() }).get(key);
        e.n++;
        const name = (b.name || "").trim() || "(בלי שם)";
        e.names.set(name, (e.names.get(name) ?? 0) + 1);
      }
    }
    const approved = new Map(((await env.DB.prepare("SELECT composition, name FROM bloc_display_names WHERE status = 'approved'").all()).results || []).map((r) => [r.composition, r.name]));
    const blocs = [...by.entries()].map(([key, e]) => ({ lists: e.lists, participants: e.n, approvedName: approved.get(key) ?? null, names: [...e.names].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "he")) }))
      .sort((a, b) => b.participants - a.participants);
    return { blocs };
  },

  // קבוצות (docs/פילוח-קבוצות-תכנון.md): טעינת רשימת מיילים במנות. נשמר רק הגיבוב; replace מוחק את הרשימה הקודמת (למנה הראשונה בלבד).
  // התשובה לא אומרת כמה מהמיילים רשומים באתר.
  "POST /admin/groups/import": async ({ env, request, now, body }) => {
    await requireAdmin(env, request);
    return importGroup(env, body, now, true);
  },

  // מנהל קבוצה (הכרעת בעלים 11.10.2026): טוען רשימה רק לקבוצה שהוא מנהל — בלי יצירה, בלי שינוי שם ובלי מחיקה
  "POST /group/import": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const id = groupId(body.group);
    if (!(await managedGroups(env, participant)).some((g) => g.id === id)) throw new HttpError(403, "not_manager");
    if (body.name !== undefined) throw bad("name");
    return importGroup(env, body, now, false);
  },

  // העלאה בשלבים: שמירת הקובץ (מוצפן, בחלקים) ועיבוד החלק הראשון; המשך — חלק אחד בכל קריאה
  "POST /group/upload": async ({ env, request, now, body }) => createUpload(env, await requireManager(env, request, now, body.group), body, now),
  "POST /group/upload/continue": async ({ env, request, now, body }) => {
    const id = await requireManager(env, request, now, body.group);
    if (!Number.isInteger(body.upload)) throw bad("upload");
    return processUpload(env, id, body.upload);
  },
  "POST /admin/groups/upload": async ({ env, request, now, body }) => {
    await requireAdmin(env, request);
    return createUpload(env, groupId(body.group), body, now);
  },
  "POST /admin/groups/upload/continue": async ({ env, request, body }) => {
    await requireAdmin(env, request);
    if (!Number.isInteger(body.upload)) throw bad("upload");
    return processUpload(env, groupId(body.group), body.upload);
  },

  // הקבוצות שהמשתמש מנהל, עם גודל הרשימה (לא כמה מהם רשומים באתר)
  "GET /group/mine": async ({ env, request, now }) => {
    const { participant } = await requireAuth(env, request, now);
    return { groups: await managedGroups(env, participant) };
  },

  // מספרים למנהל הקבוצה (הכרעת בעלים 11.10.2026): כמה מהקבוצה רשומים (בסך הכול והיום), כמה שמרו השערה וכמה הצבעה.
  // רק מצטבר, ורק מ-GROUP_MIN חברים רשומים — כדי שרשימה של מייל אחד לא תגלה אם אדם מסוים נרשם או הצביע.
  "GET /group/stats": async ({ env, request, now, url }) => {
    const { participant } = await requireAuth(env, request, now);
    const id = groupId(url.searchParams.get("group"));
    if (!(await managedGroups(env, participant)).some((g) => g.id === id)) throw new HttpError(403, "not_manager");
    return groupStats(env, id, now);
  },

  // סדרות זמן למסך "ניהול קבוצה": שבעה מדדים, שעתי ב-72 השעות האחרונות ויומי לפני כן — למנהל הקבוצה בלבד
  "GET /group/series": async ({ env, request, now, url }) => {
    const id = await requireManager(env, request, now, url.searchParams.get("group"));
    return groupSeries(env, id, now);
  },
  // תמונת הקבוצה למסך "ניהול קבוצה" (השערות מול טווח הסקרים, פניות לצוות) — למנהל הקבוצה בלבד
  "GET /group/insights": async ({ env, request, now, url }) => {
    const id = await requireManager(env, request, now, url.searchParams.get("group"));
    return groupInsights(env, id, now);
  },

  // אותם מספרים למנהל האתר (POST כדי שהקבוצה תעבור בגוף דרך שרת ההערות)
  "POST /admin/groups/stats": async ({ env, request, now, body }) => {
    await requireAdmin(env, request);
    return groupStats(env, groupId(body.group), now);
  },

  // מינוי או הסרה של מנהל קבוצה לפי מייל — נשמר רק הגיבוב; המינוי תופס כשהמייל מאומת בחשבון
  "POST /admin/groups/managers": async ({ env, request, now, body }) => {
    await requireAdmin(env, request);
    const id = groupId(body.group);
    // הסרה מתוך הרשימה — לפי הידית (הגיבוב) שברשימת המנהלים
    if (body.remove && typeof body.handle === "string" && /^[0-9a-f]{64}$/.test(body.handle)) {
      await removeManager(env, id, body.handle);
      return { group: id, managers: (await env.DB.prepare("SELECT COUNT(*) AS n FROM group_managers WHERE group_id = ?").bind(id).first()).n };
    }
    const e = normalizeEmail(body.email);
    if (!e) throw bad("email");
    if (!(await env.DB.prepare("SELECT 1 AS x FROM groups WHERE id = ?").bind(id).first())) throw new HttpError(404, "not_found");
    const eh = await emailHash(env, e.norm);
    if (body.remove) await removeManager(env, id, eh);
    else await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO group_managers (group_id, email_hash, added_at) VALUES (?, ?, ?)").bind(id, eh, iso(now)),
      // המייל של המנהל נשמר מוצפן, כדי להציג למנהל האתר את רשימת המנהלים (רק למנהלים — לא לחברי הקבוצה)
      env.DB.prepare("INSERT OR REPLACE INTO group_manager_labels (group_id, email_hash, email_enc) VALUES (?, ?, ?)").bind(id, eh, await seal(env, e.display)),
    ]);
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM group_managers WHERE group_id = ?").bind(id).first()).n;
    return { group: id, managers: n };
  },

  // קישור הקבוצה (הכרעת בעלים 12.10.2026): שם באנגלית בכתובת, תמונה בראש סקר האתר, ומונה כניסות. מנהל האתר ומנהל הקבוצה — אותן אפשרויות.
  "POST /admin/groups/link": async ({ env, request, body }) => {
    await requireAdmin(env, request);
    return setGroupSlug(env, body);
  },
  "POST /group/link": async ({ env, request, now, body }) => {
    await requireManager(env, request, now, body.group);
    return setGroupSlug(env, body);
  },
  "POST /admin/groups/link-stats": async ({ env, request, now, body }) => {
    await requireAdmin(env, request);
    return linkStats(env, groupId(body.group), now);
  },
  "GET /group/link-stats": async ({ env, request, now, url }) => {
    const id = await requireManager(env, request, now, url.searchParams.get("group"));
    return linkStats(env, id, now);
  },
  "POST /admin/groups/image": async ({ env, request, now, body }) => {
    await requireAdmin(env, request);
    return setGroupImage(env, body, now);
  },
  "POST /group/image": async ({ env, request, now, body }) => {
    await requireManager(env, request, now, body.group);
    return setGroupImage(env, body, now);
  },

  // ציבורי, לבעלי הקישור: שם הקבוצה והתמונה שלה, בלי שום נתון על החברים
  "GET /group/public": async ({ env, request, now, url }) => {
    await limitGroupPublic(env, request, now);
    const slug = url.searchParams.get("slug") ?? "";
    const row = SLUG.test(slug) ? await env.DB.prepare("SELECT g.id, g.name_enc, i.updated_at AS image FROM group_links l JOIN groups g ON g.id = l.group_id LEFT JOIN group_images i ON i.group_id = g.id WHERE l.slug = ?").bind(slug).first() : null;
    if (!row) throw new HttpError(404, "not_found");
    return { id: row.id, slug, name: await open(env, row.name_enc), image: row.image ?? null };
  },
  // כניסה דרך הקישור. fresh = הדפדפן נכנס בפעם הראשונה (הלקוח זוכר). נספר ליום בלבד, בלי זהות
  "POST /group/visit": async ({ env, request, now, body }) => {
    await limitGroupPublic(env, request, now);
    const slug = typeof body.slug === "string" && SLUG.test(body.slug) ? body.slug : null;
    const link = slug ? await env.DB.prepare("SELECT group_id FROM group_links WHERE slug = ?").bind(slug).first() : null;
    if (!link) throw new HttpError(404, "not_found");
    await env.DB.prepare("INSERT INTO group_visits (group_id, day, opens, fresh) VALUES (?, ?, 1, ?) ON CONFLICT(group_id, day) DO UPDATE SET opens = opens + 1, fresh = fresh + excluded.fresh").bind(link.group_id, ilDay(now), body.fresh === true ? 1 : 0).run();
    return { ok: true };
  },

  // הצטרפות דרך הקישור (בסשן): נשמר מזהה המשתתף בלבד. נספר כחבר רק אחרי שמנהל הקבוצה הפעיל את המתג
  "POST /group/link-join": async ({ env, request, now, body }) => {
    const { participant } = await requireAuth(env, request, now);
    const slug = typeof body.slug === "string" && SLUG.test(body.slug) ? body.slug : null;
    const link = slug ? await env.DB.prepare("SELECT group_id FROM group_links WHERE slug = ?").bind(slug).first() : null;
    if (!link) throw new HttpError(404, "not_found");
    await env.DB.prepare("INSERT OR IGNORE INTO group_link_joins (group_id, participant, joined_at) VALUES (?, ?, ?)").bind(link.group_id, participant, iso(now)).run();
    // first: הקישור היה הכניסה הראשונה של הדפדפן לאתר (הלקוח זוכר)
    if (body.first === true) await env.DB.prepare("INSERT OR IGNORE INTO group_link_first (group_id, participant) VALUES (?, ?)").bind(link.group_id, participant).run();
    return { ok: true };
  },
  // מתג המנהל: לכלול כחברים את מי שנכנס דרך הקישור. כבוי ⇐ מוסתר; מספר המצטרפים מוצג רק כשהמתג פעיל
  "GET /group/link-members": async ({ env, request, now, url }) => {
    const id = await requireManager(env, request, now, url.searchParams.get("group"));
    return linkMembers(env, id);
  },
  "POST /group/link-members": async ({ env, request, now, body }) => {
    const id = await requireManager(env, request, now, body.group);
    return setLinkMembers(env, id, body.flag, body.on === true, now);
  },
  "POST /admin/groups/link-members": async ({ env, request, now, body }) => {
    await requireAdmin(env, request);
    const id = groupId(body.group);
    return typeof body.on === "boolean" ? setLinkMembers(env, id, body.flag, body.on, now) : linkMembers(env, id);
  },

  "GET /admin/groups": async ({ env, request }) => {
    await requireAdmin(env, request);
    // קבוצות שנוצרו לפני שהיה קישור: נקבע להן שם באנגלית מהשם בעברית (פעם אחת; אפשר לשנות בכרטיס)
    for (const g of (await env.DB.prepare("SELECT g.id, g.name_enc FROM groups g LEFT JOIN group_links l ON l.group_id = g.id WHERE l.slug IS NULL").all()).results || []) {
      const slug = await autoSlug(env, await open(env, g.name_enc));
      if (slug) await upsertSlug(env, g.id, slug).run();
    }
    const rows = (await env.DB.prepare("SELECT g.id, g.name_enc, g.created_at, COALESCE((SELECT s.members FROM group_sizes s WHERE s.group_id = g.id), 0) AS members, (SELECT COUNT(*) FROM group_managers a WHERE a.group_id = g.id) AS managers, l.slug, i.updated_at AS image FROM groups g LEFT JOIN group_links l ON l.group_id = g.id LEFT JOIN group_images i ON i.group_id = g.id ORDER BY g.created_at").all()).results || [];
    const mgr = (await env.DB.prepare("SELECT a.group_id, a.email_hash, a.added_at, l.email_enc, EXISTS(SELECT 1 FROM emails e WHERE e.hash = a.email_hash AND e.verified = 1) AS active FROM group_managers a LEFT JOIN group_manager_labels l ON l.group_id = a.group_id AND l.email_hash = a.email_hash ORDER BY a.added_at").all()).results || [];
    const list = async (id) => Promise.all(mgr.filter((m) => m.group_id === id).map(async (m) => ({ handle: m.email_hash, email: m.email_enc ? await open(env, m.email_enc) : null, active: !!m.active, addedAt: m.added_at })));
    return { groups: await Promise.all(rows.map(async (r) => ({ id: r.id, name: await open(env, r.name_enc), members: r.members, managers: r.managers, managerList: await list(r.id), createdAt: r.created_at, slug: r.slug ?? null, image: r.image ?? null }))) };
  },

  // מחיקת קבוצה מוחקת את כל הגיבובים שלה
  "POST /admin/groups/delete": async ({ env, request, body }) => {
    await requireAdmin(env, request);
    const id = groupId(body.group);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM group_members WHERE group_id = ?").bind(id),
      env.DB.prepare("DELETE FROM group_managers WHERE group_id = ?").bind(id),
      env.DB.prepare("DELETE FROM group_manager_labels WHERE group_id = ?").bind(id),
      env.DB.prepare("DELETE FROM group_links WHERE group_id = ?").bind(id),
      env.DB.prepare("DELETE FROM group_images WHERE group_id = ?").bind(id),
      env.DB.prepare("DELETE FROM group_visits WHERE group_id = ?").bind(id),
      env.DB.prepare("DELETE FROM group_upload_parts WHERE upload_id IN (SELECT id FROM group_uploads WHERE group_id = ?)").bind(id),
      env.DB.prepare("DELETE FROM group_uploads WHERE group_id = ?").bind(id),
      env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(id),
      env.DB.prepare("DELETE FROM group_sizes WHERE group_id = ?").bind(id),
    ]);
    return { ok: true };
  },

  // קריאה בלבד לצורך העברה לשרת ההערות; רק בעל הסשן מקבל את ההיסטוריה שלו.
  "GET /support/access": async ({ env, request, now }) => {
    const { participant, agent, client } = await requireAuth(env, request, now);
    const thread = await env.DB.prepare("SELECT status, created_at, updated_at FROM support_threads WHERE participant = ?").bind(participant).first();
    const { results } = await env.DB.prepare("SELECT id, author, text, created_at FROM support_messages WHERE participant = ? ORDER BY id").bind(participant).all();
    // via — שם העוזר, כשהבקשה באה מכניסת עוזר AI: שרת ההערות מסמן כך את ההודעה במסך הניהול
    return { participant, thread: thread ? { ...thread, messages: results || [] } : null, ...(agent ? { via: client } : {}) };
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

/** טווח הסקרים מהאתר (public/poll-ranges.json) — מתעדכן עם כל רענון נתונים; נשמר 30 דקות. נכשל ⇐ נשאר הקודם או הגיבוי שבקוד */
let rangesAt = 0;
async function loadPollRanges(env) {
  const at = Date.now();
  if (!env.POLL_RANGES_URL || at - rangesAt < 30 * 60_000) return;
  rangesAt = at;
  try {
    const r = await fetch(env.POLL_RANGES_URL, { cf: { cacheTtl: 600 } });
    if (!r.ok) return;
    const data = await r.json();
    if (data?.ranges && Object.keys(data.ranges).length) { setPollRanges(data.ranges); await markDashboardChanged(env); }
  } catch { /* נשאר הטווח הקודם */ }
}

let dashboardCache = null;
export function resetDashboardCache() { dashboardCache = null; }

/**
 * חישוב אחד משותף (הכרעת בעלים 24.10.2026): הסטטיסטיקה מחושבת לכל היותר פעם ב-DASHBOARD_MIN_MS (דקה) ונשמרת במאגר
 * (dashboard_snapshot), וכל הבקשות קוראות את התוצאה השמורה. חישוב חדש רק כשהיה שינוי מאז החישוב הקודם
 * (changed_at, מסומן בכל פעולת POST) או אחרי DASHBOARD_MAX_AGE_MS. נעילה קצרה מונעת חישובים מקבילים: מי שלא קיבל
 * אותה משתמש בתוצאה הקודמת. בכל שרת נשמר גם עותק בזיכרון לכמה שניות, כדי לא לקרוא את המאגר בכל בקשה.
 */
const DASHBOARD_MAX_AGE_MS = 10 * 60_000;
const SNAPSHOT_MEMORY_MS = 10_000;
const minMs = (env) => (env.DASHBOARD_MIN_MS === undefined ? 60_000 : Number(env.DASHBOARD_MIN_MS));
const packState = (d) => JSON.stringify({ dashboard: d.dashboard, pending: [...d.pending.keys()], groups: [...d.groups] });
const unpackState = (s) => { const o = JSON.parse(s); return { dashboard: o.dashboard, pending: new Set(o.pending), groups: new Map(o.groups) }; };
/** סימון שינוי — החישוב הבא (לא לפני דקה מהקודם) יכלול אותו */
async function markDashboardChanged(env) {
  dashboardCache = null;
  try { await env.DB.prepare("UPDATE dashboard_snapshot SET changed_at = ? WHERE id = 1").bind(clock(env)).run(); } catch { /* הטבלה עוד לא קיימת — החישוב הבא ייעשה ממילא */ }
}

/** ⇐ {dashboard, pending: Set(versionId), groups: Map(id ⇐ dashboard)} — pending נשאר בשרת בלבד */
async function dashboardState(env) {
  const at = clock(env);
  const min = minMs(env);
  if (dashboardCache && at >= dashboardCache.at && at - dashboardCache.at < Math.min(min, SNAPSHOT_MEMORY_MS)) return dashboardCache.data;
  let row = null;
  try { row = await env.DB.prepare("SELECT data, computed_at, changed_at FROM dashboard_snapshot WHERE id = 1").first(); } catch { /* בלי טבלה — חישוב ישיר */ }
  const age = row ? at - row.computed_at : Infinity;
  // min = 0 (בדיקות): כל שינוי מחושב מיד
  const stale = !row || min <= 0 || age >= DASHBOARD_MAX_AGE_MS || (row.changed_at >= row.computed_at && age >= min);
  if (!stale) { const data = unpackState(row.data); dashboardCache = { at, data }; return data; }
  // נעילה: רק בקשה אחת מחשבת; האחרות מקבלות את התוצאה הקודמת
  let mine = !row;
  if (row) {
    try { mine = (await env.DB.prepare("UPDATE dashboard_snapshot SET lock_until = ? WHERE id = 1 AND lock_until < ?").bind(at + 30_000, at).run()).meta?.changes === 1; } catch { mine = true; }
    if (!mine) { const data = unpackState(row.data); dashboardCache = { at, data }; return data; }
  }
  const data = await computeDashboard(env);
  try {
    await env.DB.prepare("INSERT INTO dashboard_snapshot (id, data, computed_at, changed_at, lock_until) VALUES (1, ?, ?, 0, 0) ON CONFLICT(id) DO UPDATE SET data = excluded.data, computed_at = excluded.computed_at, lock_until = 0")
      .bind(packState(data), at).run();
  } catch { /* בלי טבלה — התוצאה נשמרת רק בזיכרון */ }
  const unpacked = unpackState(packState(data));
  dashboardCache = { at, data: unpacked };
  return unpacked;
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
    env.DB.prepare(DECISIONS_SQL),
  ]);
  const participants = data[0].results || [];
  const decisions = new Map((data[3].results || []).map((r) => [r.version_id, r.decision]));
  const versions = (data[1].results || []).map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  const blocNames = Object.fromEntries((data[2].results || []).map(r => [r.composition, r.name]));
  const res = aggregate({ participants, versions, now, blocNames, decisions, aggregationId: `live-${now}` });
  return { dashboard: res.dashboard, pending: res.pending, groups: await groupDashboards(env, { participants, versions, now, blocNames, decisions, mod: res.mod }) };
}

/**
 * הדשבורד של כל קבוצה (docs/פילוח-קבוצות-תכנון.md): אותו חישוב על החברים בלבד — חשבון שאחד המיילים המאומתים שלו ברשימת הקבוצה.
 * החריגות נקבעות מול כלל המשתתפים. מתחת ל-GROUP_MIN משתתפים — רק הודעה, בלי שום נתון.
 */
async function groupDashboards(env, { participants, versions, now, blocNames, decisions, mod }) {
  const rows = (await env.DB.prepare(GROUP_MEMBERS_SQL).all()).results || [];
  const byGroup = new Map();
  for (const r of rows) (byGroup.get(r.group_id) ?? byGroup.set(r.group_id, new Set()).get(r.group_id)).add(r.participant);
  const out = new Map();
  for (const [id, members] of byGroup) {
    const sub = participants.filter((p) => members.has(p.id));
    const d = aggregate({ participants: sub, versions: versions.filter((v) => members.has(v.participant)), now, blocNames, decisions, moderation: mod, aggregationId: `live-${now}` }).dashboard;
    // מתחת לסף: בלי נתונים, רק הספירה (הכרעת בעלים 12.10.2026) — המסך מוצג עם אפסים והמונה עובד
    if (d.participants < GROUP_MIN) out.set(id, { group: id, belowMin: true, min: GROUP_MIN, participants: d.participants, publishedAt: now });
    else out.set(id, { ...d, group: id, min: GROUP_MIN, pendingGuesses: undefined, underReview: null });
  }
  return out;
}
const GROUP_MEMBERS_SQL = `SELECT DISTINCT group_id, participant FROM (${groupParticipants()})`;

// ---- המשימה השעתית
const hourOf = (t) => iso(Math.floor(t / HOUR) * HOUR).slice(0, 13);

/**
 * סימון "בבדיקה" אוטומטי בשעה של הצפת נרשמים — מבוטל (הכרעת בעלים 25.10.2026): ההרשמה של קבוצה דרך הקישור שלה
 * נראתה כהצפה וכל הנרשמים יצאו מהסטטיסטיקה. מספר הנרשמים בכל שעה עדיין נרשם בטבלה hours, בלי לסמן איש.
 */
export const SURGE_REVIEW = false;
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
    const d = SURGE_REVIEW ? detectHour(newcomers, (hist || []).map((h) => h.newcomers)) : { flagged: false };
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
  // אישור אוטומטי לצמיתות של השערות תקינות ושל ממתינות שנכנסו לטווח (moderationState כותב את version_accepted)
  await moderationState(env);
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
    // הספירה של הסשנים שעומדים להימחק (כניסות) מתגלגלת לפעילות המשתתף — בלי זה "כמה כניסות" היה מאבד כל כניסה שפגה
    env.DB.prepare(
      "INSERT INTO participant_activity (participant, logins, last_login_at) SELECT participant, COUNT(*), MAX(created_at) FROM sessions WHERE expires_at < ?1 OR revoked = 1 GROUP BY participant ON CONFLICT(participant) DO UPDATE SET logins = logins + excluded.logins, last_login_at = MAX(COALESCE(last_login_at, ''), excluded.last_login_at)",
    ).bind(iso(now - 24 * HOUR)),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked = 1").bind(iso(now - 24 * HOUR)),
    env.DB.prepare("DELETE FROM agent_sessions WHERE expires_at < ? OR revoked = 1").bind(iso(now - 24 * HOUR)),
    env.DB.prepare("DELETE FROM password_reset WHERE created_at < ?").bind(iso(now - RESET_TTL)),
    env.DB.prepare("DELETE FROM password_reset_email WHERE participant NOT IN (SELECT participant FROM password_reset)"),
    env.DB.prepare("DELETE FROM legacy_handoffs WHERE expires_at < ?").bind(iso(now)),
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
      if (request.method === "GET" && url.pathname === "/usage")
        return new Response(JSON.stringify({ totalUsers: await accountCount(env.DB) }), { headers: { ...headers, "cache-control": "public, max-age=60" } });
      await loadPollRanges(env);
      // 🔴 דלת אחת לעוזרי AI (lib/agent.js): נתיב שאינו ברשימה נחסם כאן, לפני כל טיפול
      const agent = await agentSession(env, requestToken(request), now);
      if (agent && !agentRoute(request.method, url.pathname)) throw new HttpError(403, "assistant_not_allowed");
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
      // תמונת קבוצה (ציבורי, לתגית img): לפי שם הקישור או מזהה הקבוצה
      if (request.method === "GET" && url.pathname === "/group/image") {
        await limitGroupPublic(env, request, now);
        const slug = url.searchParams.get("slug"), gid = url.searchParams.get("group");
        const row = slug ? (SLUG.test(slug) ? await env.DB.prepare("SELECT i.mime, i.data FROM group_links l JOIN group_images i ON i.group_id = l.group_id WHERE l.slug = ?").bind(slug).first() : null)
          : gid && GROUP_ID.test(gid) ? await env.DB.prepare("SELECT mime, data FROM group_images WHERE group_id = ?").bind(gid).first() : null;
        if (!row) throw new HttpError(404, "not_found");
        return new Response(Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0)), { headers: { ...headers, "content-type": row.mime, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
      }
      // דשבורד של קבוצה — רק לחבר בה (השרת בודק; הכפתור באתר אינו ההגנה)
      if (request.method === "GET" && url.pathname === "/dashboard" && url.searchParams.has("group")) {
        const id = groupId(url.searchParams.get("group"));
        const { participant } = await requireAuth(env, request, now);
        if (!(await myGroups(env, participant)).some((g) => g.id === id)) throw new HttpError(403, "not_member");
        const d = (await dashboardState(env)).groups.get(id) ?? { group: id, belowMin: true, min: GROUP_MIN, participants: 0, publishedAt: iso(now) };
        return new Response(JSON.stringify(d), { headers: { ...headers, "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/dashboard")
        return new Response(JSON.stringify(await dashboard(env)), { headers: { ...headers, "cache-control": "no-store" } });
      const handler = routes[`${request.method} ${url.pathname}`];
      if (!handler) throw new HttpError(404, "not_found");
      const body = request.method === "POST" ? await readJson(request, url.pathname === "/migration/create" ? HANDOFF_BODY : IMAGE_ROUTES.has(`${request.method} ${url.pathname}`) ? IMAGE_BODY : UPLOAD_ROUTES.has(`${request.method} ${url.pathname}`) ? UPLOAD_BODY : MAX_BODY) : {};
      if (body === null || typeof body !== "object" || Array.isArray(body)) throw bad("bad_json");
      if (agent && !agentBodyAllowed(request.method, url.pathname, body)) throw new HttpError(403, "assistant_not_allowed");
      const out = await handler({ env, request, url, now, body });
      if (request.method === "POST") await markDashboardChanged(env);
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
    await loadPollRanges(env);
    resetDashboardCache();
    const now = clock(env);
    const job = (async () => {
      await cleanup(env, now);
      await finishUploads(env);
      await logGroupSizes(env, now);
      await runAggregation(env, now);
    })();
    if (ctx?.waitUntil) ctx.waitUntil(job);
    await job;
  },
};
