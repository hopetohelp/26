/**
 * סקרי האתר (הכרעת בעלים 01.11.2026, docs/תוכנית-אתר-סקרי-הגזרה-01-11-2026.md): האתר עורך סקרים בעצמו.
 * סקר = הגדרה (כותרת ושאלות) של קבוצה; תשובה = שורה חדשה בכל שמירה (הוספה בלבד — ההיסטוריה המלאה נשמרת).
 * סוגי שאלות: single — בחירה אחת מתוך אפשרויות; assign — לכל פריט עמודה אחת (למשל קואליציה / נמנעים / אופוזיציה), או פיצול מנדטים בין עמודות.
 * התוצאות מוצגות רק למי שענה (הכרעת בעלים 01.11.2026), ולמנהלי הקבוצה.
 */
export const SURVEY_ID = /^[a-z0-9-]{2,40}$/;
const KEY = /^[a-z0-9_-]{1,40}$/;
export const SURVEY_STATUS = new Set(["draft", "open", "closed"]);
/** גישה למי שמחוץ לקבוצה: כלום / צפייה (סקר ותוצאות) / השתתפות */
export const SURVEY_OUTSIDE = new Set(["none", "view", "answer"]);
/** סף פרסום תוצאות לפי קבוצה — כמו בכל נתוני הקבוצות (GROUP_MIN) */
export const SURVEY_MIN = 50;

const text = (v, max) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);

function options(list, max = 40) {
  if (!Array.isArray(list) || list.length < 2 || list.length > max) return null;
  const seen = new Set(), out = [];
  for (const o of list) {
    const id = typeof o?.id === "string" && KEY.test(o.id) ? o.id : null;
    const label = text(o?.label, 80);
    if (!id || !label || seen.has(id)) return null;
    seen.add(id);
    const sub = o.sub === undefined ? undefined : text(o.sub, 80);
    if (o.sub !== undefined && !sub) return null;
    const seats = o.seats === undefined ? undefined : Number.isInteger(o.seats) && o.seats >= 0 && o.seats <= 120 ? o.seats : null;
    if (seats === null) return null;
    out.push({ id, label, ...(sub ? { sub } : {}), ...(seats !== undefined ? { seats } : {}) });
  }
  return out;
}

/** הגדרת סקר תקינה ⇐ עותק נקי, או null */
export function cleanDefinition(def) {
  const title = text(def?.title, 120);
  if (!title || !Array.isArray(def.questions) || def.questions.length < 1 || def.questions.length > 20) return null;
  const seen = new Set(), questions = [];
  for (const q of def.questions) {
    const id = typeof q?.id === "string" && KEY.test(q.id) ? q.id : null;
    const qt = text(q?.title, 200);
    if (!id || !qt || seen.has(id)) return null;
    seen.add(id);
    if (q.kind === "single") {
      const opts = options(q.options, 12);
      if (!opts) return null;
      questions.push({ id, kind: "single", title: qt, options: opts });
    } else if (q.kind === "assign") {
      const items = options(q.items, 40), columns = options(q.columns, 6);
      if (!items || !columns) return null;
      questions.push({ id, kind: "assign", title: qt, items, columns });
    } else return null;
  }
  return { title, questions };
}

/** תשובה תקינה לפי ההגדרה ⇐ עותק נקי, או null. שאלה שלא נענתה — חסרה; ב-assign פריט בלי סימון — חסר */
export function cleanAnswers(def, answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const out = {};
  for (const [k, v] of Object.entries(answers)) {
    const q = def.questions.find((x) => x.id === k);
    if (!q) return null;
    if (q.kind === "single") {
      if (!q.options.some((o) => o.id === v)) return null;
      out[k] = v;
    } else {
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      const a = {};
      for (const [item, col] of Object.entries(v)) {
        if (!q.items.some((i) => i.id === item)) return null;
        // פיצול סיעה (הכרעת בעלים 01.11.2026): {עמודה: מספר מנדטים}; אחרת — עמודה אחת לכל הסיעה
        if (col && typeof col === "object" && !Array.isArray(col)) {
          const parts = {};
          let total = 0;
          for (const [c, n] of Object.entries(col)) {
            if (!q.columns.some((x) => x.id === c) || !Number.isInteger(n) || n < 0 || n > 120) return null;
            if (n > 0) { parts[c] = n; total += n; }
          }
          if (!total || total > 120) return null;
          a[item] = parts;
        } else {
          if (!q.columns.some((c) => c.id === col)) return null;
          a[item] = col;
        }
      }
      out[k] = a;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** תוצאות: התשובה האחרונה של כל משתתף. single ⇐ ספירה לכל אפשרות; assign ⇐ לכל פריט ספירה לכל עמודה */
export function tally(def, latest) {
  const res = {};
  for (const q of def.questions) {
    if (q.kind === "single") res[q.id] = { n: 0, counts: Object.fromEntries(q.options.map((o) => [o.id, 0])) };
    else res[q.id] = { n: 0, items: Object.fromEntries(q.items.map((i) => [i.id, Object.fromEntries(q.columns.map((c) => [c.id, 0]))])) };
  }
  for (const a of latest) {
    for (const q of def.questions) {
      const v = a?.[q.id];
      if (v === undefined) continue;
      res[q.id].n++;
      if (q.kind === "single") { if (v in res[q.id].counts) res[q.id].counts[v]++; }
      else for (const [item, col] of Object.entries(v)) {
        const row = res[q.id].items[item];
        if (!row) continue;
        if (typeof col === "string") { if (row[col] !== undefined) row[col]++; continue; }
        // סיעה מפוצלת נספרת כמשתתף אחד, מחולק לפי חלקי המנדטים
        const total = Object.values(col).reduce((x, y) => x + y, 0);
        for (const [c, n] of Object.entries(col)) if (row[c] !== undefined && total) row[c] = Math.round((row[c] + n / total) * 1000) / 1000;
      }
    }
  }
  return res;
}
