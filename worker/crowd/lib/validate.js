/**
 * חוזי השמירה (docs/השתתפות-גולשים.md, "חוזי שמירה"). כל פונקציה מחזירה {ok, value} עם מטען נקי, או {ok:false, error}.
 * המטען שנשמר נבנה מחדש מהשדות המוכרים בלבד — שדה זר לא נכנס למאגר.
 */
import { IDS_2026, IDS_2022, GOV37 } from "./lists.js";

import { fixedTotals } from "./blocDefinitions.js";

export const UNITS = new Set(["vote", "seats", "blocs"]);
export const V2022_CODES = new Set(["other", "none", "blank", "ineligible", "private"]);
export const V2026_CODES = new Set(["undecided", "none", "private"]);
const TOTAL = 120;
const THRESHOLD_SEATS = 4;
const MAX_BLOCS = 5;

const fail = (error) => ({ ok: false, error });
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

export function validVote2022(v) {
  return typeof v === "string" && (IDS_2022.has(v) || V2022_CODES.has(v));
}
export function validVote2026(v) {
  return typeof v === "string" && (IDS_2026.has(v) || V2026_CODES.has(v));
}

export function validateVote(p) {
  if (!isObj(p)) return fail("payload");
  const v2022 = p.v2022 ?? null;
  const v2026 = p.v2026 ?? null;
  if (v2022 !== null && !validVote2022(v2022)) return fail("v2022");
  if (v2026 !== null && !validVote2026(v2026)) return fail("v2026");
  if (v2022 === null && v2026 === null) return fail("empty");
  return { ok: true, value: { v2022, v2026 } };
}

export function validateSeats(p) {
  if (!isObj(p) || !isObj(p.seats)) return fail("payload");
  const seats = {};
  let sum = 0;
  for (const [id, cell] of Object.entries(p.seats)) {
    if (!IDS_2026.has(id)) return fail("list");
    if (!isObj(cell) || !isInt(cell.v, 0, TOTAL)) return fail("value");
    if (cell.src !== "manual" && cell.src !== "filled") return fail("src");
    if (typeof cell.locked !== "boolean") return fail("locked");
    seats[id] = { v: cell.v, src: cell.src, locked: cell.locked };
    sum += cell.v;
  }
  if (sum !== TOTAL) return fail("sum");
  if (Object.values(seats).some(cell => cell.v > 0 && cell.v < THRESHOLD_SEATS)) return fail("threshold");
  if (!["zero", "k25", "polls"].includes(p.start)) return fail("start");
  const pollsAsOf = p.pollsAsOf ?? null;
  if (pollsAsOf !== null && !(typeof pollsAsOf === "string" && /^\d{4}-\d{2}-\d{2}/.test(pollsAsOf) && pollsAsOf.length <= 32))
    return fail("pollsAsOf");
  const mode = p.mode ?? "seats";
  if (mode !== "seats" && mode !== "pct") return fail("mode");
  // מחושב בשרת מהחלוקה המאומתת; ערך שסיפק הלקוח אינו מקור אמת.
  const coalitionSeats = [...GOV37].reduce((sum, id) => sum + (seats[id]?.v ?? 0), 0);
  const value = { mode, seats, start: p.start, pollsAsOf, coalitionSeats, fixedBlocSeats: fixedTotals({ seats }) };
  if (mode === "pct") {
    const r = validatePct(p.pct);
    if (!r.ok) return r;
    value.pct = r.value;
  }
  if (p.calculation !== undefined && mode === "pct") {
    const c = p.calculation;
    if (!isObj(c) || !Number.isFinite(c.turnout) || c.turnout <= 0 || c.turnout > 100 || !Number.isFinite(c.eligible) || c.eligible <= 0 || c.eligible > 100000000 || !Array.isArray(c.agreements) || c.agreements.length > 10) return fail("calculation");
    const used = new Set();
    for (const pair of c.agreements) {
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(id => !IDS_2026.has(id) || used.has(id)) || pair[0] === pair[1]) return fail("calculation");
      pair.forEach(id => used.add(id));
    }
    value.calculation = { turnout: c.turnout, eligible: c.eligible, agreements: c.agreements.map(pair => [...pair]) };
  }
  return { ok: true, value };
}

export const PCT_MAX_SUM = 100.05;
/** אחוזי הצבעה: כל ערך 0..100 עם ספרה אחת אחרי הנקודה לכל היותר; סכום עד 100 (סובלנות עיגול 0.05) */
export function validatePct(pct) {
  if (!isObj(pct)) return fail("pct");
  const out = {};
  let sum = 0;
  for (const [id, v] of Object.entries(pct)) {
    if (!IDS_2026.has(id)) return fail("list");
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return fail("pct_value");
    if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) return fail("pct_value");
    out[id] = Math.round(v * 10) / 10;
    sum += out[id];
  }
  if (sum > PCT_MAX_SUM) return fail("pct_sum");
  return { ok: true, value: out };
}

export function validateBlocs(p) {
  if (!isObj(p) || !Array.isArray(p.blocs)) return fail("payload");
  if (p.mode !== "gov37" && p.mode !== "custom") return fail("mode");
  if (p.blocs.length > MAX_BLOCS) return fail("count");
  const ids = new Set();
  const blocs = [];
  for (const b of p.blocs) {
    if (!isObj(b) || typeof b.id !== "string" || !/^[\w-]{1,32}$/.test(b.id) || ids.has(b.id)) return fail("id");
    ids.add(b.id);
    if (typeof b.name !== "string" || b.name.length > 40) return fail("name");
    if (!Array.isArray(b.lists)) return fail("lists");
    const used = new Set();
    for (const l of b.lists) {
      if (!IDS_2026.has(l)) return fail("list");
      if (used.has(l)) return fail("overlap");
      used.add(l);
    }
    const target = b.target ?? null;
    if (target !== null && !isInt(target, 0, TOTAL)) return fail("target");
    blocs.push({ id: b.id, name: b.name, lists: [...b.lists], target });
  }
  return { ok: true, value: { mode: p.mode, blocs } };
}

/** המחנות במסך "מה השתנה": רשימה של היום ⇐ מזהה מחנה 2022 ("" = בלי שיוך). לא נכנס לשום חישוב. */
export function validateCamps(c) {
  if (!isObj(c)) return fail("camps");
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (!IDS_2026.has(k)) return fail("camps_list");
    if (typeof v !== "string" || !/^[a-z0-9_]{0,32}$/.test(v)) return fail("camps_value");
    out[k] = v;
  }
  return { ok: true, value: out };
}

export function validatePayload(unit, payload) {
  if (unit === "vote") return validateVote(payload);
  if (unit === "seats") return validateSeats(payload);
  if (unit === "blocs") return validateBlocs(payload);
  return fail("unit");
}

/** בקשת שמירה שלמה */
export function validateSave(body) {
  if (!isObj(body)) return fail("body");
  if (!UNITS.has(body.unit)) return fail("unit");
  if (typeof body.op_id !== "string" || !/^[\w-]{8,64}$/.test(body.op_id)) return fail("op_id");
  if (typeof body.registry !== "string" || body.registry.length > 40) return fail("registry");
  const r = validatePayload(body.unit, body.payload);
  if (!r.ok) return r;
  return { ok: true, value: { unit: body.unit, op_id: body.op_id, registry: body.registry, payload: r.value } };
}

// ---- שם משתמש וסיסמה
const HEB = /[א-ת]/;
const LAT = /[A-Za-z]/;
/** שם משתמש או כתובת מייל. שם: NFKC, 3–24 תווים: אותיות עבריות או לטיניות, ספרות, קו תחתון; בלי ערבוב עברית ולטינית. מחזיר {display, norm} או null */
// כתובת מייל כשם משתמש (הכרעת בעלים 8.10.2026): נשמרת באותיות קטנות, לא נשלח אליה דבר, ולא מוצגת לאיש
const EMAIL = /^[^\s@<>()[\]"',;:\\]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,24}$/;
export function normalizeUsername(u) {
  if (typeof u !== "string") return null;
  const display = u.normalize("NFKC").trim();
  if (display.includes("@")) {
    const email = display.toLowerCase();
    return email.length <= 254 && EMAIL.test(email) ? { display: email, norm: email } : null;
  }
  if (!/^[א-תA-Za-z0-9_]{3,24}$/.test(display)) return null;
  if (HEB.test(display) && LAT.test(display)) return null;
  // צורה קנונית לייחודיות: NFKC ואז קיפול אותיות לטיניות (עברית אינה תלוית רישיות)
  return { display, norm: display.replace(/[A-Z]/g, (c) => c.toLowerCase()) };
}

const COMMON = new Set([
  "123456", "1234567", "12345678", "123456789", "111111", "000000", "654321", "123123", "12341234", "11111111", "1q2w3e",
  "password", "qwerty", "abc123", "iloveyou", "qwerty123", "password1", "admin123", "israel", "shalom", "123abc", "a12345",
  "1234567890", "0123456789", "12345678910", "1111111111", "0000000000", "qwertyuiop", "password12", "password123",
  "password1234", "1q2w3e4r5t", "qwerty1234", "qwerty12345", "iloveyou12", "abcdefghij", "abcd123456", "123456789a",
  "a123456789", "1234567890a", "9876543210", "aaaaaaaaaa", "asdfghjkl1", "123123123123", "11223344556677", "zxcvbnm123",
  "shalom1234", "israel1234", "1234512345", "qazwsxedcr", "princess12", "football12", "welcome123", "admin12345",
]);
/** סיסמה: לפחות 6 תווים ולא מהרשימה הנפוצה */
export function passwordProblem(p) {
  if (typeof p !== "string" || [...p].length < 6) return "short";
  if ([...p].length > 128) return "long";
  if (COMMON.has(p.toLowerCase()) || /^(.)\1+$/.test(p)) return "common";
  return null;
}
