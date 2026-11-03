/**
 * סקרי האתר (הכרעת בעלים 01.11.2026, docs/תוכנית-אתר-סקרי-הגזרה-01-11-2026.md): האתר עורך סקרים בעצמו.
 * סקר = הגדרה (כותרת ושאלות) של קבוצה; תשובה = שורה חדשה בכל שמירה (הוספה בלבד — ההיסטוריה המלאה נשמרת).
 * סוגי שאלות: single — בחירה אחת מתוך אפשרויות; assign — לכל פריט עמודה אחת (למשל קואליציה / נמנעים / אופוזיציה), או פיצול מנדטים בין עמודות.
 * range — בחירה מטווח מספרים (הכרעת בעלים 01.11.2026; בסקר חדש: רשימת אפשרויות או טווח בלבד, בלי שיוך).
 * הגדרות לכל סקר (survey_settings): סוג (סקר / ניחוש עם תוצאות אמת), מתי מוצגות התוצאות, סף משתתפים, מועד סגירה.
 */
export const SURVEY_ID = /^[a-z0-9-]{2,40}$/;
const KEY = /^[a-z0-9_-]{1,40}$/;
/** מזהה אפשרות: גם אותיות עבריות — סימני הרשימות של 2022 ("מחל", "פה"…) בסקר "מה הצבעתם בבחירות הקודמות" */
const OPTION_KEY = /^[a-z0-9_\u05d0-\u05ea-]{1,40}$/;
export const SURVEY_STATUS = new Set(["draft", "open", "closed"]);
/** גישה למי שמחוץ לקבוצה: כלום / צפייה (סקר ותוצאות) / השתתפות */
export const SURVEY_OUTSIDE = new Set(["none", "view", "answer"]);
/** סף פרסום תוצאות לפי קבוצה — כמו בכל נתוני הקבוצות (GROUP_MIN) */
export const SURVEY_MIN = 50;
/** סוג: סקר, או ניחוש — שאליו המנהל מוסיף תוצאות אמת (הכרעת בעלים 01.11.2026) */
export const SURVEY_KIND = new Set(["survey", "guess"]);
/** מתי רואים תוצאות: כולם עכשיו / כולם אחרי הסגירה / רק מי שענה (הכרעת בעלים 01.11.2026) */
export const SURVEY_VISIBILITY = new Set(["now", "after_close", "answered"]);
export const DEFAULT_SETTINGS = { kind: "survey", visibility: "answered", min_results: SURVEY_MIN, closes_at: null, truth: null };

const text = (v, max) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);

function options(list, max = 40) {
  if (!Array.isArray(list) || list.length < 2 || list.length > max) return null;
  const seen = new Set(), out = [];
  for (const o of list) {
    const id = typeof o?.id === "string" && OPTION_KEY.test(o.id) ? o.id : null;
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

/** טווח: מספרים שלמים, עד 100 צעדים; תוויות אופציונליות לשני הקצוות */
function range(q) {
  const { min, max } = q, step = q.step ?? 1;
  if (![min, max, step].every(Number.isInteger) || min < -1000 || max > 1000 || step < 1 || max <= min || (max - min) % step || (max - min) / step > 100) return null;
  const minLabel = q.minLabel === undefined || q.minLabel === "" ? undefined : text(q.minLabel, 40);
  const maxLabel = q.maxLabel === undefined || q.maxLabel === "" ? undefined : text(q.maxLabel, 40);
  if ((q.minLabel && !minLabel) || (q.maxLabel && !maxLabel)) return null;
  return { min, max, step, ...(minLabel ? { minLabel } : {}), ...(maxLabel ? { maxLabel } : {}) };
}
const inRange = (q, v) => Number.isInteger(v) && v >= q.min && v <= q.max && (v - q.min) % q.step === 0;

/** הגדרת סקר תקינה ⇐ עותק נקי, או null */
export function cleanDefinition(def) {
  const title = text(def?.title, 120);
  if (!title || !Array.isArray(def.questions) || def.questions.length < 1 || def.questions.length > 20) return null;
  const seen = new Set(), questions = [];
  for (const q of def.questions) {
    const id = typeof q?.id === "string" && KEY.test(q.id) ? q.id : null;
    // נוסח השאלה לא חובה — מספיקה כותרת הסקר (הכרעת בעלים 03.11.2026)
    if (typeof q?.title === "string" && q.title.trim().length > 200) return null;
    const qt = text(q?.title, 200) ?? "";
    if (!id || seen.has(id)) return null;
    seen.add(id);
    if (q.kind === "single") {
      const opts = options(q.options, 60); // עד 60: סקרי ההצבעה (הכרעת בעלים 02.11.2026)
      if (!opts) return null;
      questions.push({ id, kind: "single", title: qt, options: opts });
    } else if (q.kind === "range") {
      const r = range(q);
      if (!r) return null;
      questions.push({ id, kind: "range", title: qt, ...r });
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
    } else if (q.kind === "range") {
      if (!inRange(q, v)) return null;
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
    else if (q.kind === "range") res[q.id] = { n: 0, counts: {}, mean: null };
    else res[q.id] = { n: 0, items: Object.fromEntries(q.items.map((i) => [i.id, Object.fromEntries(q.columns.map((c) => [c.id, 0]))])), any: Object.fromEntries(q.items.map((i) => [i.id, Object.fromEntries(q.columns.map((c) => [c.id, 0]))])) };
  }
  for (const a of latest) {
    for (const q of def.questions) {
      const v = a?.[q.id];
      if (v === undefined) continue;
      res[q.id].n++;
      if (q.kind === "single") { if (v in res[q.id].counts) res[q.id].counts[v]++; }
      else if (q.kind === "range") { const c = res[q.id].counts; c[v] = (c[v] ?? 0) + 1; }
      else for (const [item, col] of Object.entries(v)) {
        const row = res[q.id].items[item];
        if (!row) continue;
        // any — כמה משתתפים שמו לפחות חלק מהסיעה בעמודה (פיצול נספר כמלא; הכרעת בעלים 03.11.2026)
        const any = res[q.id].any[item];
        if (typeof col === "string") { if (row[col] !== undefined) { row[col]++; any[col]++; } continue; }
        for (const [c, n] of Object.entries(col)) if (any[c] !== undefined && n > 0) any[c]++;
        // סיעה מפוצלת נספרת כמשתתף אחד, מחולק לפי חלקי המנדטים
        const total = Object.values(col).reduce((x, y) => x + y, 0);
        for (const [c, n] of Object.entries(col)) if (row[c] !== undefined && total) row[c] = Math.round((row[c] + n / total) * 1000) / 1000;
      }
    }
  }
  // ממוצע לשאלות טווח
  for (const q of def.questions) if (q.kind === "range" && res[q.id].n) {
    const c = res[q.id].counts;
    res[q.id].mean = Math.round((Object.entries(c).reduce((t, [v, n]) => t + Number(v) * n, 0) / res[q.id].n) * 10) / 10;
  }
  return res;
}

/**
 * הגדרות סקר מבקשת המנהל, על בסיס הקיימות ⇐ עותק נקי, או { error }.
 * truth — תוצאות האמת בניחוש: לכל שאלת בחירה מזהה אפשרות, לשאלת טווח מספר בטווח.
 */
export function cleanSettings(body, cur, def) {
  const s = { ...cur };
  if (body.kind !== undefined) { if (!SURVEY_KIND.has(body.kind)) return { error: "kind" }; s.kind = body.kind; }
  if (body.visibility !== undefined) { if (!SURVEY_VISIBILITY.has(body.visibility)) return { error: "visibility" }; s.visibility = body.visibility; }
  if (body.min_results !== undefined) { if (!Number.isInteger(body.min_results) || body.min_results < 1 || body.min_results > 10000) return { error: "min_results" }; s.min_results = body.min_results; }
  if (body.closes_at !== undefined) {
    if (body.closes_at === null || body.closes_at === "") s.closes_at = null;
    else { const t = Date.parse(body.closes_at); if (!Number.isFinite(t)) return { error: "closes_at" }; s.closes_at = new Date(t).toISOString(); }
  }
  if (body.truth !== undefined) {
    if (body.truth === null) s.truth = null;
    else {
      if (typeof body.truth !== "object" || Array.isArray(body.truth)) return { error: "truth" };
      const t = {};
      for (const [k, v] of Object.entries(body.truth)) {
        const q = def.questions.find((x) => x.id === k);
        if (!q || (q.kind === "single" && !q.options.some((o) => o.id === v)) || (q.kind === "range" && !inRange(q, v)) || q.kind === "assign") return { error: "truth" };
        t[k] = v;
      }
      s.truth = Object.keys(t).length ? t : null;
    }
  }
  return s;
}

