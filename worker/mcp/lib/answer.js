/**
 * כרטיס התשובה (`show_answer`) — המבנה והבדיקה. טהור, בלי ייבוא: השרת בודק כאן, והכרטיס מציג רק תשובה שעברה.
 *
 * 🔴 כללי האתר נאכפים כאן ולא רק בתיאור הכלי (CLAUDE.md, כללי הברזל):
 * - **שקיפות:** מספר שהאתר חישב — בקטע "numbers", ובכל פריט סוג, תאריך וקישור "איך זה חושב?" לערך קיים במילון.
 *   לטקסט, לרשימה ולטבלה שורת מקור (`source`) היא רשות: עובדה שכל אחד יודע ("61 לרוב") אינה צריכה אותה
 *   (הכרעת בעלים 12.10.2026: "לא בכל מקום צריך לדחוף שורה של תאריך ואיך זה חושב").
 * - **שני הממוצעים:** תשובה שמזכירה ממוצע סקרים — מציגה גם את הממוצע הפשוט וגם את ממוצע המודל (הכרעת בעלים 12.10.2026).
 * - **ניטרליות:** בלי המלצה, בלי "מי ינצח", ובלי "סיכוי" או המילה האסורה — תרחישים הם "שיעור תרחישים".
 * - **עברית:** כל טקסט שהמודל ניסח — בעברית.
 * - **בלי כפילות ובלי רעש** (הכרעת בעלים 12.10.2026): בתיבת מספר — רק הנתון המרכזי, וטווח או הקשר בשורה נפרדת (`detail`);
 *   כותרת אינה סוג הנתון. הכרטיס עצמו אינו מציג את הסוג, ואינו חוזר על תאריך או על "איך זה חושב?" שכבר הופיעו.
 * קפדנית, לא "מתקנת": תשובה עם בעיה נדחית עם כל הבעיות, והמודל מתקן ושולח שוב.
 */

/** סוגי המספר — אותה רשימה כמו בחוזה `Explained` (src/components/Explained.tsx) */
export { NUMBER_KINDS } from "../../../src/lib/dataCatalog.ts";
import { NUMBER_KINDS } from "../../../src/lib/dataCatalog.ts";

export const LIMITS = { title: 80, summary: 400, heading: 60, text: 1500, item: 200, label: 60, value: 20, detail: 80, cell: 60, rows: 20, sections: 8, footnote: 240, question: 120, asOf: 30, minColumns: 2, maxColumns: 5 };

const SECTION_FIELDS = { text: ["text"], list: ["items", "ordered"], numbers: ["items"], table: ["columns", "rows"] };
const COMMON = ["kind", "heading", "source"];

/** מילים שאינן ניטרליות או אסורות באתר (CLAUDE.md כלל 4: בלי "הסתברות"; "שיעור תרחישים" ולא "סיכוי") */
const FORBIDDEN = [
  [/הסתברו/u, "המילה \"הסתברות\" אסורה — \"שיעור תרחישים\""],
  [/(^|[^\p{L}])(ה|ו|ב|ל|ש)?סיכוי/u, "\"סיכוי\" — באתר: \"שיעור תרחישים\""],
  [/(^|[^\p{L}])(ש|ו)?(ינצח|תנצח|ינצחו|ניצחון|הניצחון|המנצח|המנצחת|ינצחון)/u, "בלי תחזית מי ינצח"],
  [/(ממליצ|מומלץ|המלצ)\S*\s+(\S+\s+)?(להצביע|לבחור|לתמוך)/u, "בלי המלצה"],
  [/כדאי להצביע|הצביעו ל|תצביעו|לא להצביע ל/u, "בלי קריאה להצבעה"],
];

const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);
const str = (v) => typeof v === "string" ? v.trim() : null;

/** תאריכים ושנים אינם "מספר מחושב": 12.10.2026, 2026-10-12, 12/10, 2019א, כנסת ה-26 */
export function stripDates(s) {
  return s
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.+Z-]*)?/g, " ")
    .replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, " ")
    .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, " ")
    .replace(/(^|[^\d])(19|20)\d{2}(?!\d|[.,]\d|%)/g, "$1 ")
    .replace(/(כנסת|הכנסת)\s+ה[-־]?\d{2}/g, " ");
}
export const hasNumber = (s) => /\d/.test(stripDates(s));

/** עברית: יש אותיות עבריות, והלטיניות אינן רבות מהן (שם מוצר כמו Claude מותר) */
export function isHebrew(s) {
  const he = (s.match(/[֐-׿]/g) || []).length;
  const la = (s.match(/[A-Za-z]/g) || []).length;
  return he > 0 && la <= he;
}

/**
 * ⇐ {ok: true, answer} (מנוקה, עם קישור מלא לכל מקור) או {ok: false, problems}.
 * `methodUrl(anchor)` ⇐ הכתובת המלאה, או null אם העוגן אינו במילון.
 */
export function validateAnswer(args, methodUrl) {
  const problems = [];
  const p = (path, msg) => problems.push(`${path}: ${msg}`);
  if (!isObj(args)) return { ok: false, problems: ["התשובה חייבת להיות אובייקט"] };
  const known = new Set(["title", "summary", "sections", "footnote", "suggested_questions"]);
  for (const k of Object.keys(args)) if (!known.has(k)) p(k, "שדה לא מוכר");

  const prose = (path, v, max, required = false) => {
    const s = str(v);
    if (s === null || !s) { if (required || v !== undefined) p(path, required ? "חובה" : "טקסט ריק"); return undefined; }
    if (s.length > max) p(path, `ארוך מ-${max} תווים`);
    if (!isHebrew(s)) p(path, "חייב להיות בעברית");
    for (const [re, why] of FORBIDDEN) if (re.test(s)) p(path, why);
    return s;
  };
  const value = (path, v, max) => {
    const s = typeof v === "number" ? String(v) : str(v);
    if (!s) { p(path, "חובה"); return ""; }
    if (s.length > max) p(path, `ארוך מ-${max} תווים`);
    for (const [re, why] of FORBIDDEN) if (re.test(s)) p(path, why);
    return s;
  };
  const source = (path, v) => {
    if (!isObj(v)) { p(path, "חובה: {kind, asOf, method}"); return undefined; }
    const kind = str(v.kind);
    if (!NUMBER_KINDS.includes(kind)) p(`${path}.kind`, `אחד מ: ${NUMBER_KINDS.join(" | ")}`);
    const asOf = str(v.asOf);
    if (!asOf || asOf.length > LIMITS.asOf) p(`${path}.asOf`, "תאריך הנתון (\"נכון ל\"), חובה");
    const method = str(v.method);
    const url = method ? methodUrl(method) : null;
    if (!url) p(`${path}.method`, "עוגן קיים במילון המספרים (למשל model, current, engine)");
    for (const k of Object.keys(v)) if (!["kind", "asOf", "method"].includes(k)) p(`${path}.${k}`, "שדה לא מוכר");
    return { kind, asOf, method, url };
  };

  const answer = {
    title: prose("title", args.title, LIMITS.title, true),
    summary: prose("summary", args.summary, LIMITS.summary),
    sections: [],
    footnote: prose("footnote", args.footnote, LIMITS.footnote),
    suggested_questions: [],
  };

  const sections = args.sections;
  if (!Array.isArray(sections) || !sections.length || sections.length > LIMITS.sections) p("sections", `1 עד ${LIMITS.sections} קטעים`);
  else sections.forEach((sec, i) => {
    const path = `sections[${i}]`;
    if (!isObj(sec)) return p(path, "קטע חייב להיות אובייקט");
    const kind = sec.kind;
    if (!SECTION_FIELDS[kind]) return p(`${path}.kind`, "text | list | numbers | table");
    for (const k of Object.keys(sec)) if (!COMMON.includes(k) && !SECTION_FIELDS[kind].includes(k)) p(`${path}.${k}`, `שדה לא מוכר בקטע ${kind}`);
    const out = { kind, heading: prose(`${path}.heading`, sec.heading, LIMITS.heading) };
    // כותרת אומרת מה רואים, לא את סוג הנתון ("סיכום סקרים — …" אינו אומר כלום; הכרעת בעלים 12.10.2026)
    if (out.heading && NUMBER_KINDS.some((k) => out.heading.startsWith(k))) p(`${path}.heading`, "כותרת שאומרת מה רואים (למשל \"מנדטים לפי גושים\"), לא סוג הנתון");
    if (kind === "text") {
      out.text = prose(`${path}.text`, sec.text, LIMITS.text, true);
    } else if (kind === "list") {
      if (!Array.isArray(sec.items) || !sec.items.length || sec.items.length > LIMITS.rows) p(`${path}.items`, `1 עד ${LIMITS.rows} פריטים`);
      else out.items = sec.items.map((it, j) => prose(`${path}.items[${j}]`, it, LIMITS.item, true));
      out.ordered = sec.ordered === true;
    } else if (kind === "table") {
      const cols = sec.columns;
      if (!Array.isArray(cols) || cols.length < LIMITS.minColumns || cols.length > LIMITS.maxColumns) p(`${path}.columns`, `${LIMITS.minColumns} עד ${LIMITS.maxColumns} עמודות`);
      else out.columns = cols.map((c, j) => prose(`${path}.columns[${j}]`, c, LIMITS.cell, true));
      if (!Array.isArray(sec.rows) || !sec.rows.length || sec.rows.length > LIMITS.rows) p(`${path}.rows`, `1 עד ${LIMITS.rows} שורות`);
      else out.rows = sec.rows.map((row, j) => {
        if (!Array.isArray(row) || (out.columns && row.length !== out.columns.length)) { p(`${path}.rows[${j}]`, "תא לכל עמודה"); return []; }
        return row.map((c, k) => value(`${path}.rows[${j}][${k}]`, c, LIMITS.cell));
      });
    } else if (kind === "numbers") {
      if (!Array.isArray(sec.items) || !sec.items.length || sec.items.length > LIMITS.rows) p(`${path}.items`, `1 עד ${LIMITS.rows} מספרים`);
      else out.items = sec.items.map((it, j) => {
        const ip = `${path}.items[${j}]`;
        if (!isObj(it)) { p(ip, "{label, value, detail?, kind, asOf, method}"); return null; }
        for (const k of Object.keys(it)) if (!["label", "value", "detail", "kind", "asOf", "method"].includes(k)) p(`${ip}.${k}`, "שדה לא מוכר");
        const label = prose(`${ip}.label`, it.label, LIMITS.label, true);
        if (label && hasNumber(label)) p(`${ip}.label`, "המספר — בשדה value");
        const v = value(`${ip}.value`, it.value, LIMITS.value);
        // הנתון המרכזי לבדו; טווח או הקשר — בשורה נפרדת וקטנה (detail), הכרעת בעלים 12.10.2026
        if (/;|טווח|חסר|מתוך|לרוב/u.test(v)) p(`${ip}.value`, "רק הנתון המרכזי (\"53 מנדטים\"); טווח או הקשר (\"טווח 47–63\", \"חסרים 8 לרוב\") — בשדה detail");
        const detail = it.detail === undefined ? undefined : prose(`${ip}.detail`, it.detail, LIMITS.detail);
        return { label, value: v, ...(detail ? { detail } : {}), source: source(ip, { kind: it.kind, asOf: it.asOf, method: it.method }) };
      });
      if (sec.source !== undefined) p(`${path}.source`, "בקטע numbers המקור בכל פריט");
    }
    // שורת מקור לטקסט, רשימה וטבלה — רשות (מספרים מחושבים: בקטע numbers)
    if (kind !== "numbers" && sec.source !== undefined) out.source = source(`${path}.source`, sec.source);
    answer.sections.push(out);
  });

  const qs = args.suggested_questions;
  if (!Array.isArray(qs) || qs.length < 1 || qs.length > 3) p("suggested_questions", "1 עד 3 שאלות להמשך");
  else answer.suggested_questions = qs.map((q, i) => prose(`suggested_questions[${i}]`, q, LIMITS.question, true));

  return problems.length ? { ok: false, problems } : { ok: true, answer };
}

/** הסכמה לכלי (JSON Schema) — תואמת לבדיקה */
const s = (maxLength, description) => ({ type: "string", maxLength, ...(description ? { description } : {}) });
const SOURCE_PROPS = {
  kind: { type: "string", enum: NUMBER_KINDS, description: "The number's kind, exactly as the site labels it." },
  asOf: s(LIMITS.asOf, "The data date (\"as of\"), as given in the data file's about.updatedAt or the record's date."),
  method: s(40, "The dictionary anchor that explains the number (about.methodAnchor of the data file, e.g. model, current, means, accuracy, results, engine, crowd)."),
};
const SOURCE = { type: "object", properties: SOURCE_PROPS, required: ["kind", "asOf", "method"], additionalProperties: false };
const sec = (kind, props, required) => ({
  type: "object",
  properties: { kind: { type: "string", enum: [kind] }, heading: s(LIMITS.heading, "Optional. Hebrew."), ...props },
  required: ["kind", ...required],
  additionalProperties: false,
});
export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    title: s(LIMITS.title, "Hebrew."),
    summary: s(LIMITS.summary, "Optional. Hebrew, one or two sentences."),
    sections: {
      type: "array", minItems: 1, maxItems: LIMITS.sections,
      items: {
        anyOf: [
          sec("numbers", { items: { type: "array", minItems: 1, maxItems: LIMITS.rows, items: { type: "object", properties: { label: s(LIMITS.label, "Hebrew, no number."), value: s(LIMITS.value, "Only the main number, e.g. \"23 מנדטים\" or \"3.1%\"."), detail: s(LIMITS.detail, "Optional second, smaller line: the range or the practical context, e.g. \"טווח הסקרים 47–63\" or \"חסרים 8 לרוב\"."), ...SOURCE_PROPS }, required: ["label", "value", "kind", "asOf", "method"], additionalProperties: false } } }, ["items"]),
          sec("text", { text: s(LIMITS.text, "Hebrew paragraph."), source: SOURCE }, ["text"]),
          sec("list", { items: { type: "array", minItems: 1, maxItems: LIMITS.rows, items: s(LIMITS.item) }, ordered: { type: "boolean" }, source: SOURCE }, ["items"]),
          sec("table", { columns: { type: "array", minItems: LIMITS.minColumns, maxItems: LIMITS.maxColumns, items: s(LIMITS.cell) }, rows: { type: "array", minItems: 1, maxItems: LIMITS.rows, items: { type: "array", items: s(LIMITS.cell) } }, source: SOURCE }, ["columns", "rows"]),
        ],
      },
    },
    footnote: s(LIMITS.footnote, "Optional. Hebrew small print."),
    suggested_questions: { type: "array", minItems: 1, maxItems: 3, items: s(LIMITS.question), description: "1–3 follow-up questions in Hebrew, shown as buttons." },
  },
  required: ["title", "sections", "suggested_questions"],
  additionalProperties: false,
};
