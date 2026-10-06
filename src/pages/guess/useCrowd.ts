/** מצב ההשתתפות בדפדפן: אסימון, מצב המשתתף מהשרת, וטיוטה+שמירה לכל יחידה. */
import { useCallback, useEffect, useState } from "react";
import { CROWD_URL, CrowdError, call, type Me, type Payload, type Unit } from "../../lib/crowdApi";
import * as S from "../../lib/crowdSession";
import { meta } from "../../lib/data";

const listeners = new Set<(t: string | null) => void>();

export function useSession() {
  const [token, setTok] = useState<string | null>(S.getToken);
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    listeners.add(setTok);
    return () => {
      listeners.delete(setTok);
    };
  }, []);
  const setToken = useCallback((t: string | null) => {
    S.setToken(t);
    listeners.forEach((l) => l(t));
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
  return { token, setToken, me, refresh, online: !!CROWD_URL };
}

export type SaveState = "idle" | "saving" | "error";
export const errorText = (e: unknown): string => {
  if (!(e instanceof CrowdError)) return "משהו השתבש. אפשר לנסות שוב.";
  if (e.code === "offline") return "השמירה עוד לא פעילה באתר. הטיוטה נשמרת בדפדפן הזה.";
  if (e.code === "network") return "אין חיבור לשרת. הטיוטה שמורה; אפשר לנסות שוב.";
  if (e.code === "no_username") return "כדי להוסיף מייל צריך קודם שם משתמש.";
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
  const setDraft = useCallback(
    (p: P | null) => {
      setDraftState(p);
      if (p === null) S.clearDraft(unit);
      else S.saveDraft(unit, p);
    },
    [unit],
  );
  // מכשיר חדש אחרי כניסה: הגרסה האחרונה מהשרת, אם אין כאן טיוטה
  useEffect(() => {
    if (!remote || S.loadDraft(unit) || same(remote, S.loadSaved(unit))) return;
    S.setSaved(unit, remote);
    setSavedState(remote);
    setDraftState(remote);
  }, [remote, unit]);
  const status: "draft" | "saved" | "dirty" = saved === null ? "draft" : same(saved, draft) ? "saved" : "dirty";

  const save = useCallback(
    async (token: string | null, setToken: (t: string) => void) => {
      if (!draft) return false;
      setState("saving");
      setError(null);
      try {
        let tok = token;
        if (!tok) {
          tok = (await call<{ token: string }>("/participant", { body: {} })).token;
          setToken(tok);
        }
        const op_id = S.opIdFor(unit, draft);
        await call("/save", { token: tok, body: { unit, op_id, registry: meta.dataAsOf, payload: draft } });
        S.clearPending(unit);
        S.setSaved(unit, draft);
        S.clearDraft(unit);
        setSavedState(draft);
        setState("idle");
        return true;
      } catch (e) {
        setError(errorText(e));
        setState("error");
        return false;
      }
    },
    [draft, unit],
  );
  return { draft, setDraft, saved, status, save, state, error };
}

export const STATUS_LABEL = { draft: "טיוטה", saved: "נשמר", dirty: "שינויים שלא נשמרו" } as const;
