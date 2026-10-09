/**
 * תור השליחה: גרסה שנשמרה בדפדפן ולא אושרה בשרת (אין חיבור, או שהתשובה נחסמה בדרך) נשלחת שוב
 * (וכך גם הערות מכפתור "הערה?" — src/lib/feedback.ts) בפתיחת האתר, כשהחיבור חוזר, כשחוזרים ללשונית, ופעם בשתי דקות כל עוד יש בתור משהו.
 * אותו op_id בכל ניסיון — השרת אינו יוצר כפילות. אין כאן ממשק; מצב התור נקרא מ-crowdSession.isQueued.
 */
import { CROWD_URL, CrowdError, call, type Unit } from "./crowdApi";
import * as S from "./crowdSession";
import { meta } from "./data";
import { flushFeedbackOutbox, queuedFeedbackCount } from "./feedback";

const UNITS: Unit[] = ["vote", "seats", "blocs"];
export const OUTBOX_EVENT = "crowd-outbox";
/** שמירה הגיעה לשרת ⇐ הסטטיסטיקות החיות מתרעננות */
export const SAVED_EVENT = "crowd-saved";
const RETRY_MS = 120_000;

export const queuedUnits = (): Unit[] => UNITS.filter(S.isQueued);

let running: Promise<void> | null = null;

/** שולח את כל מה שבתור. מחזיר כשהסבב הסתיים; סבב שני במקביל מצטרף לראשון. */
export function flushOutbox(): Promise<void> {
  running ??= (async () => {
    const token = S.getToken();
    if (!CROWD_URL || !token) return;
    for (const unit of queuedUnits()) {
      const p = S.pendingOp(unit);
      if (!p) continue;
      try {
        const r = await call<{ blind?: boolean }>("/save", { token, body: { unit, op_id: p.op, registry: meta.dataAsOf, payload: JSON.parse(p.body) } });
        // התשובה נחסמה ⇐ עוד לא בטוח שנקלט; נשאר בתור לסבב הבא
        if (!r?.blind && S.pendingOp(unit)?.op === p.op) S.clearPending(unit);
      } catch (e) {
        if (!(e instanceof CrowdError) || e.status === 0 || e.status === 401 || e.status === 429 || e.status >= 500) continue;
        // השרת דחה את התוכן עצמו: מוציאים מהתור, והגרסה חוזרת להיות "שינויים שלא נשמרו"
        S.clearPending(unit);
        S.saveDraft(unit, JSON.parse(p.body));
        S.setSaved(unit, null);
      }
    }
  })().finally(() => {
    running = null;
    if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_EVENT));
  });
  return running;
}

let started = false;
export function startOutbox(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const kick = () => {
    if (queuedUnits().length) void flushOutbox();
    if (queuedFeedbackCount()) void flushFeedbackOutbox();
  };
  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(); });
  window.setInterval(kick, RETRY_MS);
  window.setTimeout(kick, 2000);
}
