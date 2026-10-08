/** מצב ההשתתפות בדפדפן: אסימון, מצב המשתתף מהשרת, וטיוטה+שמירה לכל יחידה. */
import { useCallback, useEffect, useState } from "react";
import { CROWD_URL, CrowdError, call, type Me, type Payload, type Unit } from "../../lib/crowdApi";
import * as S from "../../lib/crowdSession";
import { meta } from "../../lib/data";

type Auth = { token: string | null; link: string | null };
const listeners = new Set<(a: Auth) => void>();
const emit = () => {
  const a = { token: S.getToken(), link: S.getLink() };
  listeners.forEach((l) => l(a));
};

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
    S.setToken(t);
    if (!keepLink) S.setLink(null);
    emit();
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
  if (e.code === "network") return "אין חיבור לשרת. הטיוטה שמורה; אפשר לנסות שוב.";
  if (e.code === "no_password") return "לחשבון הזה עוד אין שם משתמש וסיסמה.";
  if (e.code === "username_taken") return "שם המשתמש הזה כבר תפוס. אפשר לבחור אחר — או להיכנס, אם הוא שלכם.";
  if (e.code === "bad_username") return "שם משתמש: 3–24 אותיות (עבריות או לטיניות, לא שתיהן), ספרות או קו תחתון.";
  if (e.code === "weak_password") return "הסיסמה קצרה או נפוצה מדי. לפחות 6 תווים.";
  if (e.code === "bad_link") return "הקישור האישי הזה אינו בתוקף (אולי נוצר אחריו קישור חדש).";
  if (e.status === 429) return "יותר מדי ניסיונות. כדאי לחכות דקה ולנסות שוב.";
  if (e.status === 401) return "פרטי הכניסה אינם נכונים או שהכניסה פגה.";
  return `השרת דחה את הבקשה (${e.code}).`;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** טיוטה ביחידה אחת: נשמרת בדפדפן עד שמירה, עם מצב (טיוטה / נשמר / שינויים שלא נשמרו) */
export function useUnit<P extends Payload>(unit: Unit, initial: P | null, remote?: P) {
  const [draft, setDraftState] = useState<P | null>(() => S.loadDraft<P>(unit) ?? S.loadSaved<P>(unit) ?? initial);
  const [saved, setSavedState] = useState<P | null>(() => S.loadSaved<P>(unit));
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const setDraft = useCallback(
    (p: P | null) => {
      setDraftState(p);
      if (p === null) S.clearDraft(unit);
      else S.saveDraft(unit, p);
    },
    [unit],
  );
  useEffect(() => {
    const sync = () => {
      setDraftState(S.loadDraft<P>(unit) ?? S.loadSaved<P>(unit) ?? initial);
      setSavedState(S.loadSaved<P>(unit));
    };
    window.addEventListener("crowd-clear", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("crowd-clear", sync); window.removeEventListener("storage", sync); };
  }, [unit, initial]);
  // מכשיר חדש אחרי כניסה: הגרסה האחרונה מהשרת, אם אין כאן טיוטה
  useEffect(() => {
    if (!remote || S.loadDraft(unit) || same(remote, S.loadSaved(unit))) return;
    S.setSaved(unit, remote);
    setSavedState(remote);
    setDraftState(remote);
  }, [remote, unit]);
  const status: "draft" | "saved" | "dirty" = saved === null ? "draft" : same(saved, draft) ? "saved" : "dirty";

  /** שמירה בשרת — רק עם סשן (חשבון). בלי סשן הכפתור פותח קודם הרשמה/כניסה (SaveButton) */
  const save = useCallback(
    async (token: string, payload: P | null = draft) => {
      if (!payload) return false;
      setState("saving");
      setError(null);
      setErrorLog(null);
      try {
        const op_id = S.opIdFor(unit, payload);
        await call("/save", { token, body: { unit, op_id, registry: meta.dataAsOf, payload } });
        S.clearPending(unit);
        S.setSaved(unit, payload);
        const current = S.loadDraft<P>(unit);
        if (!current || same(current, payload)) { S.clearDraft(unit); setDraftState(payload); }
        setSavedState(payload);
        setState("idle");
        return true;
      } catch (e) {
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
  return { draft, setDraft, saved, status, save, state, error, errorLog };
}

export const STATUS_LABEL = { draft: "טיוטה", saved: "נשמר", dirty: "שינויים שלא נשמרו" } as const;
