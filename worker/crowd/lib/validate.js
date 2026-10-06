/**
 * חוזי השמירה (docs/השתתפות-גולשים.md, "חוזי שמירה"). כל פונקציה מחזירה {ok, value} עם מטען נקי, או {ok:false, error}.
 * המטען שנשמר נבנה מחדש מהשדות המוכרים בלבד — שדה זר לא נכנס למאגר.
 */
import { IDS_2026, IDS_2022 } from "./lists.js";

export const UNITS = new Set(["vote", "seats", "blocs"]);
export const V2022_CODES = new Set(["other", "none", "blank", "ineligible", "private"]);
export const V2026_CODES = new Set(["undecided", "none", "private"]);
const TOTAL = 120;
const MAX_BLOCS = 4;

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
  if (!["zero", "k25", "polls"].includes(p.start)) return fail("start");
  const pollsAsOf = p.pollsAsOf ?? null;
  if (pollsAsOf !== null && !(typeof pollsAsOf === "string" && /^\d{4}-\d{2}-\d{2}/.test(pollsAsOf) && pollsAsOf.length <= 32))
    return fail("pollsAsOf");
  return { ok: true, value: { seats, start: p.start, pollsAsOf } };
}

export function validateBlocs(p) {
  if (!isObj(p) || !Array.isArray(p.blocs)) return fail("payload");
  if (p.mode !== "gov37" && p.mode !== "custom") return fail("mode");
  if (p.blocs.length < 1 || p.blocs.length > MAX_BLOCS) return fail("count");
  const ids = new Set();
  const used = new Set();
  const blocs = [];
  let sum = 0;
  let allSet = true;
  for (const b of p.blocs) {
    if (!isObj(b) || typeof b.id !== "string" || !/^[\w-]{1,32}$/.test(b.id) || ids.has(b.id)) return fail("id");
    ids.add(b.id);
    if (typeof b.name !== "string" || b.name.length > 40) return fail("name");
    if (!Array.isArray(b.lists)) return fail("lists");
    for (const l of b.lists) {
      if (!IDS_2026.has(l)) return fail("list");
      if (used.has(l)) return fail("overlap");
      used.add(l);
    }
    const target = b.target ?? null;
    if (target !== null && !isInt(target, 0, TOTAL)) return fail("target");
    if (target === null) allSet = false;
    else sum += target;
    blocs.push({ id: b.id, name: b.name, lists: [...b.lists], target });
  }
  if (sum > TOTAL) return fail("sum");
  if (allSet && sum !== TOTAL) return fail("sum");
  return { ok: true, value: { mode: p.mode, blocs } };
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
/** NFKC, 3–24 תווים: אותיות עבריות או לטיניות, ספרות, קו תחתון; בלי ערבוב עברית ולטינית. מחזיר {display, norm} או null */
export function normalizeUsername(u) {
  if (typeof u !== "string") return null;
  const display = u.normalize("NFKC").trim();
  if (!/^[א-תA-Za-z0-9_]{3,24}$/.test(display)) return null;
  if (HEB.test(display) && LAT.test(display)) return null;
  // צורה קנונית לייחודיות: NFKC ואז קיפול אותיות לטיניות (עברית אינה תלוית רישיות)
  return { display, norm: display.replace(/[A-Z]/g, (c) => c.toLowerCase()) };
}

const COMMON = new Set([
  "1234567890", "0123456789", "12345678910", "1111111111", "0000000000", "qwertyuiop", "password12", "password123",
  "password1234", "1q2w3e4r5t", "qwerty1234", "qwerty12345", "iloveyou12", "abcdefghij", "abcd123456", "123456789a",
  "a123456789", "1234567890a", "9876543210", "aaaaaaaaaa", "asdfghjkl1", "123123123123", "11223344556677", "zxcvbnm123",
  "shalom1234", "israel1234", "1234512345", "qazwsxedcr", "princess12", "football12", "welcome123", "admin12345",
]);
/** סיסמה: לפחות 10 תווים ולא מהרשימה הנפוצה */
export function passwordProblem(p) {
  if (typeof p !== "string" || [...p].length < 10) return "short";
  if ([...p].length > 128) return "long";
  if (COMMON.has(p.toLowerCase()) || /^(.)\1+$/.test(p)) return "common";
  return null;
}
