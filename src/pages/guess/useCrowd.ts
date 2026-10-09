/** מצב ההשתתפות בדפדפן: אסימון, מצב המשתתף מהשרת, וטיוטה+שמירה לכל יחידה. */
import { useCallback, useEffect, useRef, useState } from "react";
import { CROWD_URL, CrowdError, call, type Me, type Payload, type Unit } from "../../lib/crowdApi";
import * as S from "../../lib/crowdSession";
import { meta } from "../../lib/data";
import { OUTBOX_EVENT, SAVED_EVENT } from "../../lib/outbox";
import { adoptSupportThreads } from "../../lib/feedback";

type Auth = { token: string | null; link: string | null };
const listeners = new Set<(a: Auth) => void>();
const emit = () => {
  const a = { token: S.getToken(), link: S.getLink() };
  listeners.forEach((l) => l(a));
};

/**
 * בלי חשבון — הכול נשמר בדפדפן בלבד ולא נכנס לסטטיסטיקות (הכרעת בעלים 9.10.2026). אין יותר חשבון אורח אוטומטי.
 * בהרשמה או בכניסה, מה שנשמר בדפדפן עולה לחשבון (syncLocal).
 */
/** שליחות שממתינות לסיום רצף שינויים — נשלחות מיד כשהדף נסגר או מוסתר */
type Pending = (() => void) & { unit?: Unit };
const pendingSends = new Set<Pending>();
function flushPending() { [...pendingSends].forEach((f) => f()); }
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPending);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPending(); });
}
/** הסשן הקיים, אם יש. בלי חשבון ⇐ null, והשינויים נשארים בדפדפן */
export function ensureSession(): Promise<string | null> {
  return Promise.resolve(CROWD_URL ? S.getToken() : null);
}

/** מפתחות הדפדפן שמחוץ ל-crowdSession: המחנות (Changes.tsx) */
const CAMPS_KEY = "elections26.camps";

/**
 * אחרי הרשמה או כניסה: כל מה שנשמר בדפדפן בלי חשבון עולה לחשבון — השערות (טיוטה שלא נשמרה), מחנות,
 * ושיחת תמיכה שנפתחה בלי חשבון. כל שלב עצמאי; כישלון משאיר את הטיוטה בדפדפן לניסיון הבא.
 */
export async function syncLocal(token: string): Promise<void> {
  for (const unit of ["seats", "blocs", "vote"] as Unit[]) {
    const draft = S.loadDraft<Payload>(unit);
    if (!draft || JSON.stringify(draft) === JSON.stringify(S.loadSaved(unit))) continue;
    try {
      await call("/save", { token, body: { unit, op_id: S.opIdFor(unit, draft), registry: meta.dataAsOf, payload: draft } });
      S.clearPending(unit);
      S.setSaved(unit, draft);
      S.clearDraft(unit);
    } catch { /* נשאר בדפדפן */ }
  }
  try {
    const camps = localStorage.getItem(CAMPS_KEY);
    if (camps) await call("/prefs", { token, body: { camps: JSON.parse(camps) } });
  } catch { /* נשאר בדפדפן */ }
  try { await adoptSupportThreads(token); } catch { /* ינוסה שוב בכניסה הבאה */ }
  window.dispatchEvent(new Event("crowd-clear"));
  window.dispatchEvent(new Event(SAVED_EVENT));
}

/** החשבון בדפדפן: סשן (שם משתמש וסיסמה) והקישור האישי שנוצר כאן. בלי סשן — רק טיוטות מקומיות. */
export function useSession() {
  const [auth, setAuth] = useState<Auth>(() => ({ token: S.getToken(), link: S.getLink() }));
  const { token, link } = auth;
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    listeners.add(setAuth);
    return () => {
      listeners.delete(setAuth);
    };
  }, []);
  /** סשן חדש. משתמש אחר או יציאה (null) ⇐ הקישור האישי נשכח מהדפדפן */
  const setToken = useCallback((t: string | null, keepLink = false) => {
    const changed = t !== S.getToken();
    S.setToken(t);
    if (!keepLink) S.setLink(null);
    if (!t) S.setPicture(null);
    emit();
    if (t && changed) void syncLocal(t);
  }, []);
  /** קישור אישי חדש (הרשמה / "קישור חדש") ⇐ מוצג לשמירה עד שמאשרים */
  const setLink = useCallback((l: string) => {
    if (l !== S.getLink()) S.setLinkAck(false);
    S.setLink(l);
    emit();
  }, []);
  const refresh = useCallback(async () => {
    if (!CROWD_URL || !token) return setMe(null);
    try {
      setMe(await call<Me>("/me", { token }));
    } catch (e) {
      if (e instanceof CrowdError && e.status === 401) setToken(null);
    }
  }, [token, setToken]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { token, link, setToken, setLink, me, refresh, online: !!CROWD_URL };
}

export type SaveState = "idle" | "saving" | "error";
export const errorText = (e: unknown): string => {
  if (!(e instanceof CrowdError)) return "משהו השתבש. אפשר לנסות שוב.";
  if (e.code === "offline") return "השמירה עוד לא פעילה באתר. הטיוטה נשמרת בדפדפן הזה.";
  if (e.code === "network") return "אין חיבור לשרת. הטיוטה שמורה אצלכם; אפשר לנסות שוב.";
  if (e.code === "has_password") return "לחשבון הזה כבר יש סיסמה.";
  if (e.code === "no_password") return "לחשבון הזה עוד אין סיסמה.";
  if (e.code === "username_taken" || e.code === "email_taken") return "המייל הזה כבר רשום באתר. אפשר להיכנס איתו — או להשתמש במייל אחר.";
  if (e.code === "email_required") return "נא להזין כתובת מייל תקינה.";
  if (e.code === "verify_not_enabled") return "אימות המייל עוד לא הופעל באתר.";
  if (e.code === "verify_unavailable") return "לא ניתן לשלוח אימות לכתובת הזו כרגע. כתבו לנו בתמיכה.";
  if (e.code === "verify_failed") return "שליחת מייל האימות נכשלה. נסו שוב בעוד כמה דקות.";
  if (e.code === "nothing_to_verify") return "אין מייל שממתין לאימות.";
  if (e.code === "bad_name") return "השם ארוך מדי (עד 40 תווים).";
  if (e.code === "account_required") return "כדי לשמור בשרת צריך חשבון: Google או מייל.";
  if (e.code === "bad_username") return "שם משתמש: 3–24 אותיות (עבריות או לטיניות, לא שתיהן), ספרות או קו תחתון, או כתובת מייל תקינה.";
  if (e.code === "weak_password") return "הסיסמה קצרה או נפוצה מדי. לפחות 6 תווים.";
  if (e.code === "bad_link") return "הקישור האישי הזה אינו בתוקף (אולי נוצר אחריו קישור חדש).";
  if (e.status === 429) return "יותר מדי ניסיונות. כדאי לחכות דקה ולנסות שוב.";
  if (e.status === 401) return "פרטי הכניסה אינם נכונים או שהכניסה פגה.";
  return `השרת דחה את הבקשה (${e.code}).`;
};

const IDLE_SAVE_MS = 15_000;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** טיוטה ביחידה אחת: נשמרת בדפדפן עד שמירה, עם מצב (טיוטה / נשמר / שינויים שלא נשמרו) */
export function useUnit<P extends Payload>(unit: Unit, initial: P | null, remote?: P) {
  const [draft, setDraftState] = useState<P | null>(() => S.loadDraft<P>(unit) ?? S.loadSaved<P>(unit) ?? initial);
  const [saved, setSavedState] = useState<P | null>(() => S.loadSaved<P>(unit));
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(() => S.isQueued(unit));
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const saveRef = useRef<(token: string, payload: P) => Promise<boolean>>();
  const timer = useRef<number>();
  const setDraft = useCallback(
    (p: P | null) => {
      setDraftState(p);
      if (p === null) S.clearDraft(unit);
      else S.saveDraft(unit, p);
      // השינוי הראשון (אין עדיין חשבון) נשמר מיד ויוצר חשבון אורח וקישור אישי (הכרעת בעלים 9.10.2026).
      // שינויים נוספים נשמרים בלחיצה על "שמור", או אחרי 15 שניות בלי שינוי; בסגירת הדף או מעבר
      // לאפליקציה אחרת — נשלח מיד (flushPending)
      window.clearTimeout(timer.current);
      if (p === null || same(p, S.loadSaved(unit))) return;
      let tries = 0;
      const send: Pending = () => {
        pendingSends.delete(send);
        // כבר נשמר (בלחיצה על "שמור") ⇐ אין מה לשלוח שוב
        if (same(p, S.loadSaved(unit))) return;
        // כישלון (רשת) ⇐ ניסיון חוזר עד 3 פעמים, כל עוד זו עדיין הגרסה האחרונה
        const retry = () => { if (++tries <= 3 && same(S.loadDraft(unit), p)) timer.current = window.setTimeout(send, 5000 * tries); };
        void ensureSession().then(async (token) => {
          if (!token || !saveRef.current) return retry();
          if (!(await saveRef.current(token, p))) retry();
        });
      };
      pendingSends.forEach((f) => f.unit === unit && pendingSends.delete(f));
      send.unit = unit;
      pendingSends.add(send);
      // בלי חשבון — נשאר בדפדפן בלבד; עולה לחשבון בהרשמה (syncLocal)
      if (!S.getToken()) { pendingSends.delete(send); return; }
      timer.current = window.setTimeout(send, IDLE_SAVE_MS);
    },
    [unit],
  );
  useEffect(() => {
    const sync = () => {
      setDraftState(S.loadDraft<P>(unit) ?? S.loadSaved<P>(unit) ?? initial);
      setSavedState(S.loadSaved<P>(unit));
    };
    const outbox = () => { sync(); setQueued(S.isQueued(unit)); };
    window.addEventListener("crowd-clear", sync);
    window.addEventListener("storage", sync);
    window.addEventListener(OUTBOX_EVENT, outbox);
    return () => { window.removeEventListener("crowd-clear", sync); window.removeEventListener("storage", sync); window.removeEventListener(OUTBOX_EVENT, outbox); };
  }, [unit, initial]);
  // מכשיר חדש אחרי כניסה: הגרסה האחרונה מהשרת, אם אין כאן טיוטה
  useEffect(() => {
    if (!remote || S.loadDraft(unit) || same(remote, S.loadSaved(unit))) return;
    S.setSaved(unit, remote);
    setSavedState(remote);
    setDraftState(remote);
  }, [remote, unit]);
  const status: "draft" | "saved" | "dirty" = saved === null ? "draft" : same(saved, draft) ? "saved" : "dirty";

  const keepLocal = (payload: P) => {
    S.setSaved(unit, payload);
    const current = S.loadDraft<P>(unit);
    if (!current || same(current, payload)) { S.clearDraft(unit); setDraftState(payload); }
    setSavedState(payload);
    setQueued(S.isQueued(unit));
    setState("idle");
  };

  /** שמירה בשרת — רק עם סשן (חשבון). בלי סשן הכפתור פותח קודם הרשמה/כניסה (SaveButton) */
  const save = useCallback(
    async (token: string, payload: P | null = draft) => {
      if (!payload) return false;
      setState("saving");
      setError(null);
      setErrorLog(null);
      try {
        const op_id = S.opIdFor(unit, payload);
        const r = await call<{ blind?: boolean }>("/save", { token, body: { unit, op_id, registry: meta.dataAsOf, payload } });
        // התשובה נחסמה ⇐ נשמר אצל הגולש ונשאר בתור השליחה עד אישור (src/lib/outbox.ts)
        if (!r?.blind) { S.clearPending(unit); window.dispatchEvent(new Event(SAVED_EVENT)); }
        keepLocal(payload);
        return true;
      } catch (e) {
        // אין חיבור לשרת ⇐ שמירה מקומית קודם: הגרסה נשמרת בדפדפן ותישלח אוטומטית כשהחיבור יחזור
        if (e instanceof CrowdError && e.code === "network") { keepLocal(payload); return true; }
        setError(errorText(e));
        setErrorLog(JSON.stringify({
          action: "שמירת השערה", unit, registry: meta.dataAsOf,
          ...(e instanceof CrowdError ? { code: e.code, status: e.status, ...e.diagnostic } : { code: "unexpected" }),
        }, null, 2));
        setState("error");
        return false;
      }
    },
    [draft, unit],
  );
  saveRef.current = save;
  return { draft, setDraft, saved, status, queued, save, state, error, errorLog };
}

export const STATUS_LABEL = { draft: "טיוטה", saved: "נשמר", dirty: "שינויים שלא נשמרו" } as const;
